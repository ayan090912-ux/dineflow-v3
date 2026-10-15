import React, { useState, useEffect } from 'react';
import {
  Crown,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Calendar,
  Users,
  Utensils,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Building2,
  FileText,
  Mail,
  Phone,
  Check,
  X
} from 'lucide-react';
import { Button, Badge, Modal } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { WeddingAccessRequest } from '../../packages/types';

interface WeddingRequestsTabProps {
  onRefreshStats?: () => void;
}

export const WeddingRequestsTab: React.FC<WeddingRequestsTabProps> = ({ onRefreshStats }) => {
  const [requests, setRequests] = useState<WeddingAccessRequest[]>([]);
  const [caterers, setCaterers] = useState<Array<{ id: string; name: string; slug: string; city: string }>>([]);
  const [counts, setCounts] = useState({ all: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Review Modal State
  const [selectedRequest, setSelectedRequest] = useState<WeddingAccessRequest | null>(null);
  const [selectedCatererId, setSelectedCatererId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAdminWeddingRequests(statusFilter, searchQuery);
      setRequests(data.requests || []);
      setCaterers(data.catererCandidates || []);
      setCounts(data.counts || { all: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0 });
    } catch (err: any) {
      setError(err.message || 'Failed to load wedding requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const handleOpenReviewModal = (req: WeddingAccessRequest) => {
    setSelectedRequest(req);
    setSelectedCatererId(req.cateringRestaurantId || (caterers.length > 0 ? caterers[0].id : ''));
    setReviewNotes(req.reviewNotes || '');
    setActionError(null);
    setActionSuccess(null);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    if (!selectedCatererId) {
      setActionError('Please select a catering kitchen partner to fulfill orders for this wedding.');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.approveAdminWeddingRequest(selectedRequest.id, selectedCatererId, reviewNotes);
      setActionSuccess(`Application approved! Workspace ${res.workspaceId} provisioned successfully.`);
      await loadRequests();
      if (onRefreshStats) onRefreshStats();
      setTimeout(() => {
        setSelectedRequest(null);
      }, 1500);
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve application.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!reviewNotes.trim()) {
      setActionError('Please enter a rejection reason or feedback notes.');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.rejectAdminWeddingRequest(selectedRequest.id, reviewNotes.trim());
      setActionSuccess('Application marked as rejected.');
      await loadRequests();
      if (onRefreshStats) onRefreshStats();
      setTimeout(() => {
        setSelectedRequest(null);
      }, 1200);
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject application.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveNotesOnly = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.updateAdminWeddingRequestNotes(selectedRequest.id, reviewNotes);
      setActionSuccess('Review notes updated.');
      await loadRequests();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save notes.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-amber-500/20 text-amber-300">
              <Crown className="w-4 h-4" />
            </span>
            <h3 className="text-base font-semibold text-white">Wedding & Private Event Requests</h3>
          </div>
          <p className="text-xs text-white/50 mt-0.5">
            Review host applications, verify celebration parameters, and assign responsible catering kitchens.
          </p>
        </div>

        <button
          onClick={loadRequests}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] text-xs text-white/80 transition-all cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* 2. Metric Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-xl p-3.5 bg-[#0e1117] border border-white/[0.08] space-y-1">
          <span className="text-[11px] font-medium text-white/45 uppercase tracking-wider">Total Applications</span>
          <p className="text-xl font-bold font-mono text-white">{counts.all}</p>
        </div>

        <div className="rounded-xl p-3.5 bg-amber-500/10 border border-amber-500/25 space-y-1">
          <span className="text-[11px] font-medium text-amber-300/80 uppercase tracking-wider">Awaiting Review</span>
          <p className="text-xl font-bold font-mono text-amber-300">{counts.submitted}</p>
        </div>

        <div className="rounded-xl p-3.5 bg-emerald-500/10 border border-emerald-500/25 space-y-1">
          <span className="text-[11px] font-medium text-emerald-300/80 uppercase tracking-wider">Approved Workspaces</span>
          <p className="text-xl font-bold font-mono text-emerald-300">{counts.approved}</p>
        </div>

        <div className="rounded-xl p-3.5 bg-rose-500/10 border border-rose-500/25 space-y-1">
          <span className="text-[11px] font-medium text-rose-300/80 uppercase tracking-wider">Rejected / Closed</span>
          <p className="text-xl font-bold font-mono text-rose-300">{counts.rejected}</p>
        </div>
      </div>

      {/* 3. Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0e1117] p-3 rounded-xl border border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                statusFilter === st
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                  : 'bg-white/[0.04] text-white/60 border-white/[0.06] hover:text-white'
              }`}
            >
              {st === 'ALL' ? 'All Requests' : st.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search host, event, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadRequests()}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.10] text-xs text-white placeholder:text-white/30 outline-none focus:border-amber-400/60"
          />
        </div>
      </div>

      {/* 4. Requests List / Table */}
      {loading ? (
        <div className="py-16 text-center bg-[#0e1117] rounded-xl border border-white/[0.08] text-white/50 space-y-2">
          <RefreshCw className="w-6 h-6 text-amber-400 mx-auto animate-spin" />
          <p className="text-xs">Loading wedding requests...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="py-16 text-center bg-[#0e1117] rounded-xl border border-white/[0.08] text-white/50 space-y-2">
          <Crown className="w-8 h-8 text-white/20 mx-auto" />
          <p className="text-sm font-medium text-white/70">No Wedding Requests Found</p>
          <p className="text-xs text-white/40">No applications match the current filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-4 rounded-xl bg-[#0e1117] border border-white/[0.08] hover:border-amber-500/30 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-2 max-w-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {req.id}
                  </span>
                  <h4 className="text-sm font-semibold text-white tracking-tight">{req.weddingName}</h4>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      req.lifecycleStatus === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : req.lifecycleStatus === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {req.lifecycleStatus}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-white/60">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <span className="truncate">{req.applicantName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <span>{req.eventDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <span className="truncate">{req.venueName}, {req.venueCity}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Utensils className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <span className="truncate">{req.cateringRestaurantName || 'Unassigned'}</span>
                  </div>
                </div>

                {req.reviewNotes && (
                  <p className="text-[11px] text-white/45 italic line-clamp-1 border-l-2 border-amber-500/40 pl-2">
                    Review: {req.reviewNotes}
                  </p>
                )}
              </div>

              {/* Action */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenReviewModal(req)}
                  className="bg-white/[0.05] hover:bg-white/[0.12] text-white text-xs px-3.5 py-1.5 rounded-lg border border-white/[0.15]"
                >
                  Review Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Detailed Review & Approval Modal */}
      {selectedRequest && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedRequest(null)}
          title={`Application Review: ${selectedRequest.weddingName}`}
          size="lg"
        >
          <div className="space-y-5 text-xs text-white/80">
            {actionError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {/* Host Details Grid */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wider block">Applicant Name</span>
                <span className="text-white font-semibold">{selectedRequest.applicantName}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wider block">Email</span>
                <span className="text-white font-mono">{selectedRequest.applicantEmail}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wider block">Phone / WhatsApp</span>
                <span className="text-white">{selectedRequest.applicantPhone}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wider block">Scheduled Date</span>
                <span className="text-white">{selectedRequest.eventDate} ({selectedRequest.startTime} - {selectedRequest.endTime})</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wider block">Venue & City</span>
                <span className="text-white">{selectedRequest.venueName}, {selectedRequest.venueCity}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wider block">Expected Guests</span>
                <span className="text-amber-300 font-bold">{selectedRequest.estimatedGuestCount} Guests</span>
              </div>
            </div>

            {/* Notes & Requirements */}
            {(selectedRequest.cateringNotes || selectedRequest.additionalRequirements || selectedRequest.notes) && (
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                {selectedRequest.cateringNotes && (
                  <div>
                    <span className="text-[10px] text-amber-300/70 font-semibold block uppercase">Catering Partner Notes:</span>
                    <p className="text-white/70">{selectedRequest.cateringNotes}</p>
                  </div>
                )}
                {selectedRequest.additionalRequirements && (
                  <div>
                    <span className="text-[10px] text-amber-300/70 font-semibold block uppercase">Additional Requirements:</span>
                    <p className="text-white/70">{selectedRequest.additionalRequirements}</p>
                  </div>
                )}
                {selectedRequest.notes && (
                  <div>
                    <span className="text-[10px] text-amber-300/70 font-semibold block uppercase">Applicant Notes:</span>
                    <p className="text-white/70">{selectedRequest.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* MANDATORY FULFILLMENT PARTNER ASSIGNMENT */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-white">Responsible Fulfillment Kitchen Partner *</span>
              </div>
              <p className="text-[11px] text-amber-200/70">
                A wedding ordering workspace requires an authorized kitchen destination to fulfill line tickets. Select the verified venue partner responsible for this celebration's menu and orders.
              </p>

              <select
                value={selectedCatererId}
                onChange={(e) => setSelectedCatererId(e.target.value)}
                disabled={actionLoading || selectedRequest.lifecycleStatus === 'APPROVED'}
                className="w-full px-3.5 py-2 rounded-xl bg-[#0e1117] border border-amber-500/40 text-xs text-white outline-none focus:border-amber-400"
              >
                <option value="">-- Select Catering Restaurant Partner --</option>
                {caterers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.city ? `${c.city} • ` : ''}{c.slug})
                  </option>
                ))}
              </select>
            </div>

            {/* Review Notes Input */}
            <div>
              <label className="block text-[11px] font-semibold text-white/70 mb-1">
                Internal Review Notes / Rejection Reason
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter internal verification notes, menu alignment comments, or rejection feedback..."
                className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.10] text-xs text-white placeholder:text-white/30 outline-none focus:border-white/30 resize-none"
              />
            </div>

            {/* Audit Trail */}
            {selectedRequest.reviewedBy && (
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[10px] text-white/50 flex items-center justify-between">
                <span>Last Reviewed by: <strong className="text-white/75">{selectedRequest.reviewedBy}</strong></span>
                <span>{selectedRequest.reviewedAt ? new Date(selectedRequest.reviewedAt).toLocaleString() : ''}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/[0.10]">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {selectedRequest.lifecycleStatus !== 'REJECTED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={handleReject}
                    className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Reject Application
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleSaveNotesOnly}
                  className="border-white/[0.15] text-white/70 text-xs"
                >
                  Save Notes
                </Button>
              </div>

              {selectedRequest.lifecycleStatus !== 'APPROVED' ? (
                <Button
                  variant="brand"
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleApprove}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5"
                >
                  {actionLoading ? 'Provisioning Workspace...' : 'Approve & Provision Workspace'}
                </Button>
              ) : (
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>Workspace Active</span>
                </span>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
