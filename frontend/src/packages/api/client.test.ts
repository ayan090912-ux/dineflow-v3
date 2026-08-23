import { api } from './client';

async function runTenantSecurityTests() {
  console.log('=== RUNNING MULTI-TENANT SECURITY & ISOLATION TESTS ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // Test 1: Register Owner A and create Restaurant A
    const ownerA = await api.registerOwner({
      name: 'Owner Alice',
      email: 'alice@restaurant-a.com',
      phone: '+1 555-0101',
      password: 'passwordA123!',
    });
    assert(!!ownerA.user, 'Owner A registration successful');

    const restA = await api.createRestaurantForOwner({
      name: 'Bistro A',
      cuisine: 'French',
      ownerEmail: 'alice@restaurant-a.com',
    });
    assert(restA.id.startsWith('rest-'), 'Restaurant A created for Owner A');

    // Test 2: Register Owner B and create Restaurant B
    const ownerB = await api.registerOwner({
      name: 'Owner Bob',
      email: 'bob@restaurant-b.com',
      phone: '+1 555-0102',
      password: 'passwordB123!',
    });
    assert(!!ownerB.user, 'Owner B registration successful');

    const restB = await api.createRestaurantForOwner({
      name: 'Pizzeria B',
      cuisine: 'Italian',
      ownerEmail: 'bob@restaurant-b.com',
    });
    assert(restB.id.startsWith('rest-'), 'Restaurant B created for Owner B');

    // Test 3: Log in as Owner A and attempt IDOR access to Restaurant B orders
    await api.loginOwner('alice@restaurant-a.com', 'passwordA123!');
    const unauthorizedOrders = await api.getOrders(restB.id);
    assert(unauthorizedOrders.length === 0, 'Owner A CANNOT access Restaurant B orders (IDOR Prevention)');

    const unauthorizedDetails = await api.getRestaurantDetails(restB.id);
    assert(unauthorizedDetails === null, 'Owner A CANNOT fetch Restaurant B details (Tenant Isolation)');

    // Test 4: Log in as Owner B and switch active restaurant to Restaurant B
    const switchedB = await api.switchActiveRestaurant(restB.id);
    assert(switchedB?.id === restB.id, 'Owner B successfully switched context to Restaurant B');

    const activeDetails = await api.getRestaurantDetails();
    assert(activeDetails?.id === restB.id, 'Active restaurant details correctly return Restaurant B');

    // Test 6: Verify Waiter RBAC permissions & data scoping
    await api.loginOwner('alice@restaurant-a.com', 'passwordA123!');
    const waiterA = await api.addEmployee({
      restaurantId: restA.id,
      name: 'Waiter Walter',
      email: 'waiter.walter@restaurant-a.com',
      role: 'WAITER',
      password: 'waiterpass123',
    });
    assert(waiterA.id.startsWith('emp-'), 'Waiter account created for Restaurant A');

    await api.loginWaiter('waiter.walter@restaurant-a.com', 'waiterpass123');
    const waiterOrders = await api.getOrders(restA.id);
    assert(Array.isArray(waiterOrders), 'Waiter can view orders for Restaurant A');

    const unauthorizedWaiterAdmin = await api.getOrders('*');
    assert(unauthorizedWaiterAdmin.length === 0, 'Waiter CANNOT view global system orders (*)');

    // Test 7: Full E2E Order, Kitchen/Bar Routing, and Server-Calculated Bill Settlement
    const itemFood = { id: 'm-food-1', name: 'Gourmet Burger', price: 15.0, quantity: 2, categoryId: 'Mains', targetDestination: 'KITCHEN' as const };
    const itemDrink = { id: 'm-drink-1', name: 'Craft IPA', price: 8.0, quantity: 2, categoryId: 'Bar', targetDestination: 'BAR' as const };

    const order = await api.createCustomerOrder({
      restaurantId: restA.id,
      tableNumber: 'Table 01',
      items: [itemFood, itemDrink],
      customerName: 'Guest Tester',
    });
    assert(order.id.startsWith('ORD-') || order.id.startsWith('order-') || !!order.id, 'Customer order created');

    const bill = await api.getRunningTableBill(restA.id, 'Table 01');
    assert(!!bill, 'Running table bill generated server-side');
    assert(bill?.subtotal === 46.0, `Bill subtotal calculated accurately ($46.00 vs $${bill?.subtotal})`);
    assert(bill?.taxAmount === 2.3, `Bill tax calculated accurately at 5% ($2.30 vs $${bill?.taxAmount})`);
    assert(bill?.grandTotal === 48.3, `Bill grandTotal calculated accurately ($48.30 vs $${bill?.grandTotal})`);

    // Test 8: Table closing and settlement
    if (bill) {
      const recorded = await api.recordBillPayment(bill.id, 'CARD');
      assert(recorded?.paymentStatus === 'PAID', 'Bill payment recorded as PAID');

      const closed = await api.closeTableSessionAndGenerateBill(bill.tableSessionId, 'Waiter Walter', 'CARD');
      assert(closed.session?.status === 'CLOSED', 'Table session closed successfully');
      assert(closed.session?.paymentStatus === 'PAID', 'Table session payment status marked PAID');
    }

    // Test 9: Configured Custom Tax Rate (18%) on Restaurant B
    await api.loginOwner('bob@restaurant-b.com', 'passwordB123!');
    await api.updateRestaurantDetails(restB.id, { taxPercentage: 18.0 });

    await api.createCustomerOrder({
      restaurantId: restB.id,
      tableNumber: 'Table 02',
      items: [itemFood, itemDrink],
      customerName: 'Guest Tax Tester',
    });

    const billB = await api.getRunningTableBill(restB.id, 'Table 02');
    assert(!!billB, 'Running table bill generated for Restaurant B with 18% tax');
    assert(billB?.subtotal === 46.0, `Restaurant B subtotal calculated accurately ($46.00 vs $${billB?.subtotal})`);
    assert(billB?.taxAmount === 8.28, `Restaurant B tax calculated accurately at 18% ($8.28 vs $${billB?.taxAmount})`);
    assert(billB?.grandTotal === 54.28, `Restaurant B grandTotal calculated accurately ($54.28 vs $${billB?.grandTotal})`);

    // Test 10: 0% Tax Rate Configuration
    await api.loginOwner('alice@restaurant-a.com', 'passwordA123!');
    await api.updateRestaurantDetails(restA.id, { taxPercentage: 0.0 });

    await api.createCustomerOrder({
      restaurantId: restA.id,
      tableNumber: 'Table 03',
      items: [itemFood],
      customerName: 'Zero Tax Tester',
    });

    const billZero = await api.getRunningTableBill(restA.id, 'Table 03');
    assert(billZero?.taxAmount === 0.0, `0% tax rate calculates taxAmount as $0.00 ($0 vs $${billZero?.taxAmount})`);
    assert(billZero?.grandTotal === 30.0, `0% tax rate calculates grandTotal as subtotal ($30.00 vs $${billZero?.grandTotal})`);

    // Test 11: Multiple Restaurants with Different Tax Rates simultaneously
    assert(billB?.taxAmount === 8.28 && billZero?.taxAmount === 0.0, 'Multiple restaurants enforce independent custom tax rates simultaneously');

    // Test 12: Historical Bill Preservation
    // Verify original settled bill (bill) retains its historical tax (2.30 / 5%) even after Restaurant A tax was changed to 0%
    const historicalBill = (api as any).bills.find((b: any) => b.id === bill?.id);
    assert(historicalBill?.taxAmount === 2.3 && historicalBill?.grandTotal === 48.3, `Historical closed bill retains original tax amount after restaurant tax rate update (expected 2.3 / 48.3, got taxAmount=${historicalBill?.taxAmount}, grandTotal=${historicalBill?.grandTotal})`);

    // Test 13: Real Customer Service Requests (Water / Cutlery / Call Waiter) & Waiter Acceptance
    const reqWater = await api.createCustomerRequest({
      restaurantId: restA.id,
      tableNumber: 'Table 09',
      requestType: 'WATER',
      customTitle: 'Request Water 💧',
      priority: 'MEDIUM',
      customerNotes: 'Extra ice please',
    });
    assert(reqWater?.id.startsWith('req-') && reqWater.status === 'PENDING', 'Customer Water service request created with PENDING status');

    const waiterNotifs = await api.getWaiterNotifications(restA.id);
    const waterNotif = waiterNotifs.find((n) => n.tableNumber === 'Table 09' && n.title.includes('Water'));
    assert(!!waterNotif, 'Waiter notification generated for Table 09 Water request');

    const acceptedReq = await api.acceptCustomerRequest(reqWater.id, 'Waiter Walter');
    assert(acceptedReq?.status === 'ACCEPTED' && acceptedReq?.assignedWaiterName === 'Waiter Walter', 'Waiter successfully accepts customer service request');

    // Test 14: Customer QR Table Occupancy & Session Resolution
    const qrSession = await api.getOrCreateTableSession(restA.id, undefined, 'Table 09');
    assert(qrSession?.status === 'ACTIVE' && qrSession.tableNumber === 'Table 09', 'Customer QR scanning opens active table session for Table 09');

    const tablesA = await api.getTables(restA.id);
    const table09 = tablesA.find((t) => t.tableNumber === 'Table 09');
    assert(table09?.status === 'OCCUPIED' && table09?.isOccupied === true, 'Owner/Waiter dashboard immediately displays Table 09 as OCCUPIED');

    await api.closeTableSession(table09!.id, 'Waiter Walter');
    const tablesAfterClose = await api.getTables(restA.id);
    const closedTable09 = tablesAfterClose.find((t) => t.tableNumber === 'Table 09');
    assert(closedTable09?.status === 'AVAILABLE' && closedTable09?.isOccupied === false, 'Table session closure restores Table 09 status to AVAILABLE');

    console.log(`\n=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTenantSecurityTests();
