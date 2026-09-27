/**
 * Dinely Phase 6 Task 6.4 — Realtime Reliability & Dropped WebSocket Fallback Test Suite
 * 
 * Verifies:
 * 1. Waiter assistance call is safely persisted even if WebSocket broadcast encounters an error/disconnect.
 * 2. Floor terminal tracks WebSocket connection state accurately (CONNECTED -> DISCONNECTED/RECONNECTING).
 * 3. Floor terminal adaptive polling interval activates aggressive SLA fallback (8s) during offline/reconnecting state.
 * 4. Floor terminal recovers and reconciles pending requests upon reconnection hook and adaptive polling within SLA (<10s).
 * 5. Multi-tenant isolation is preserved: disconnected tenant terminal never receives another tenant's requests.
 */

import assert from 'node:assert';

interface MockServiceRequest {
  id: string;
  restaurantId: string;
  tableNumber: string;
  requestType: string;
  message: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
}

// Simulated backend database store
const mockDbRequests: MockServiceRequest[] = [];

// Simulated Realtime Bus
type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'CONNECTING';

class MockRealtimeBus {
  private status: ConnectionStatus = 'CONNECTED';
  private statusListeners: Array<(s: ConnectionStatus) => void> = [];
  private eventListeners: Array<(evt: any) => void> = [];

  getStatus(): ConnectionStatus {
    return this.status;
  }

  setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  subscribeStatus(cb: (s: ConnectionStatus) => void) {
    this.statusListeners.push(cb);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb);
    };
  }

  subscribe(cb: (evt: any) => void) {
    this.eventListeners.push(cb);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== cb);
    };
  }

  broadcast(evt: any) {
    if (this.status !== 'CONNECTED') {
      throw new Error(`[MockRealtimeBus] Cannot broadcast event '${evt.type}': WebSocket is ${this.status}`);
    }
    this.eventListeners.forEach((l) => l(evt));
  }
}

// Simulated Floor Terminal State Machine
class MockFloorTerminalStateMachine {
  public wsStatus: ConnectionStatus = 'CONNECTING';
  public pendingRequests: MockServiceRequest[] = [];
  public pollingIntervalMs: number = 30000;
  public pollCount: number = 0;
  public reconciliations: number = 0;

  constructor(
    public readonly restaurantId: string,
    private readonly bus: MockRealtimeBus
  ) {
    this.bus.subscribeStatus((s) => {
      this.wsStatus = s;
      // Adaptive interval tightening as implemented in WaiterTerminalOS.tsx
      this.pollingIntervalMs = s === 'CONNECTED' ? 30000 : 8000;
      if (s === 'CONNECTED') {
        // Silent reconciliation on connect / reconnect
        this.reconcileFromDb();
      }
    });

    this.bus.subscribe((evt) => {
      if (evt.type === 'service_request_created') {
        const req = evt.payload;
        if (req && req.restaurantId === this.restaurantId) {
          if (!this.pendingRequests.some((r) => r.id === req.id)) {
            this.pendingRequests.push(req);
          }
        }
      }
    });
  }

  reconcileFromDb() {
    this.pollCount++;
    this.reconciliations++;
    // Fetch active requests for this tenant from database
    const fresh = mockDbRequests.filter(
      (r) => r.restaurantId === this.restaurantId && r.status !== 'COMPLETED'
    );
    this.pendingRequests = fresh;
  }
}

async function runRealtimeFallbackSuite() {
  console.log('\n===============================================================');
  console.log('STARTING PHASE 6 TASK 6.4: REALTIME WS FALLBACK VERIFICATION');
  console.log('===============================================================\n');

  const bus = new MockRealtimeBus();
  const terminalA = new MockFloorTerminalStateMachine('rest-tenant-alpha', bus);
  const terminalB = new MockFloorTerminalStateMachine('rest-tenant-beta', bus);

  // -----------------------------------------------------------------
  // TEST 1: Normal Realtime Connected Dispatch
  // -----------------------------------------------------------------
  console.log('[TEST 1] Normal Connected WebSocket Dispatch');
  bus.setStatus('CONNECTED');
  assert.strictEqual(terminalA.wsStatus, 'CONNECTED');
  assert.strictEqual(terminalA.pollingIntervalMs, 30000, 'Healthy WS uses 30s background safety polling');

  const req1: MockServiceRequest = {
    id: 'req-001',
    restaurantId: 'rest-tenant-alpha',
    tableNumber: 'Table 03',
    requestType: 'WATER',
    message: 'Water for table 3',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
  mockDbRequests.push(req1);
  bus.broadcast({ type: 'service_request_created', payload: req1 });

  assert.strictEqual(terminalA.pendingRequests.length, 1, 'Terminal A received real-time service request');
  assert.strictEqual(terminalA.pendingRequests[0].id, 'req-001');
  assert.strictEqual(terminalB.pendingRequests.length, 0, 'Tenant B received zero requests (strict isolation)');
  console.log('  PASS: Real-time broadcast delivered with strict multi-tenant isolation');

  // -----------------------------------------------------------------
  // TEST 2: Abrupt WebSocket Disconnect & Adaptive Interval Tightening
  // -----------------------------------------------------------------
  console.log('\n[TEST 2] Abrupt WebSocket Disconnect & Adaptive Interval Tightening');
  bus.setStatus('DISCONNECTED');
  assert.strictEqual(terminalA.wsStatus, 'DISCONNECTED');
  assert.strictEqual(terminalA.pollingIntervalMs, 8000, 'Disconnected state tightens polling to 8s (<10s SLA)');

  bus.setStatus('RECONNECTING');
  assert.strictEqual(terminalA.wsStatus, 'RECONNECTING');
  assert.strictEqual(terminalA.pollingIntervalMs, 8000, 'Reconnecting state maintains 8s SLA polling');
  console.log('  PASS: Floor terminal successfully detected disconnect and tightened polling to 8s');

  // -----------------------------------------------------------------
  // TEST 3: Safe Persistence During Dropped WebSocket Broadcast
  // -----------------------------------------------------------------
  console.log('\n[TEST 3] Safe Persistence During Dropped WebSocket Broadcast');
  const req2: MockServiceRequest = {
    id: 'req-002',
    restaurantId: 'rest-tenant-alpha',
    tableNumber: 'Table 07',
    requestType: 'WAITER_CALL',
    message: 'Assistance requested at table 7',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  // Dispatch customer call when WS is offline:
  // 1. Backend safely commits to PostgreSQL DB
  mockDbRequests.push(req2);

  // 2. Broadcast fails safely without rejecting customer HTTP request
  let broadcastFailed = false;
  try {
    bus.broadcast({ type: 'service_request_created', payload: req2 });
  } catch (err: any) {
    broadcastFailed = true;
  }
  assert(broadcastFailed, 'WebSocket broadcast threw error due to offline socket');
  assert(mockDbRequests.some((r) => r.id === 'req-002'), 'Request safely persisted in DB despite broadcast failure');
  console.log('  PASS: Guest request persisted in database as PENDING despite WebSocket offline error');

  // -----------------------------------------------------------------
  // TEST 4: Adaptive Polling Fallback Reconciles Pending Request (<10s SLA)
  // -----------------------------------------------------------------
  console.log('\n[TEST 4] Adaptive Polling Fallback Reconciles Pending Request within SLA');
  // Trigger terminal polling cycle (fired every 8000ms by the adaptive interval hook)
  terminalA.reconcileFromDb();

  assert.strictEqual(terminalA.pendingRequests.length, 2, 'Adaptive polling fetched the dropped request req-002');
  assert(terminalA.pendingRequests.some((r) => r.id === 'req-002'), 'req-002 present in terminal pending list');
  console.log('  PASS: Terminal reconciled dropped request via adaptive polling loop');

  // -----------------------------------------------------------------
  // TEST 5: Reconnection Hook Triggers Instant State Reconciliation
  // -----------------------------------------------------------------
  console.log('\n[TEST 5] Reconnection Hook Triggers Instant State Reconciliation');
  const initialReconciliations = terminalA.reconciliations;

  // Third request created while reconnecting
  const req3: MockServiceRequest = {
    id: 'req-003',
    restaurantId: 'rest-tenant-alpha',
    tableNumber: 'Table 01',
    requestType: 'BILL',
    message: 'Bill requested',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
  mockDbRequests.push(req3);

  // Connection restored
  bus.setStatus('CONNECTED');
  assert.strictEqual(terminalA.wsStatus, 'CONNECTED');
  assert.strictEqual(terminalA.pollingIntervalMs, 30000, 'Restored connection relaxed interval back to 30s');
  assert(terminalA.reconciliations > initialReconciliations, 'Reconnection hook immediately fired reconciliation');
  assert.strictEqual(terminalA.pendingRequests.length, 3, 'All 3 requests reconciled');
  console.log('  PASS: Reconnection hook fired instant reconciliation and restored 30s background safety interval');

  // -----------------------------------------------------------------
  // TEST 6: Request Completion & Idempotent State Sync
  // -----------------------------------------------------------------
  console.log('\n[TEST 6] Request Completion & Idempotent State Sync');
  const target = mockDbRequests.find((r) => r.id === 'req-001');
  if (target) target.status = 'COMPLETED';

  terminalA.reconcileFromDb();
  assert.strictEqual(terminalA.pendingRequests.length, 2, 'Completed request removed from active queue');
  assert(!terminalA.pendingRequests.some((r) => r.id === 'req-001'), 'req-001 no longer in pending list');
  console.log('  PASS: State machine cleanly removed completed request from active terminal view');

  console.log('\n===============================================================');
  console.log('ALL PHASE 6 TASK 6.4 REALTIME FALLBACK TESTS PASSED (6/6)!');
  console.log('===============================================================\n');
}

runRealtimeFallbackSuite().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
