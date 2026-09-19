import type { LeadStatus } from '../entities/prospect.entity';

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'replied',
  'interested',
  'demo',
  'meeting',
  'quote',
  'won',
  'lost',
];

const STOP_FOLLOW_UP_STATUSES = new Set<LeadStatus>([
  'replied',
  'interested',
  'demo',
  'meeting',
  'quote',
  'won',
  'lost',
]);

const STAGE_RANK: Record<LeadStatus, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  interested: 3,
  demo: 4,
  meeting: 5,
  quote: 6,
  won: 7,
  lost: 7,
};

export function shouldSuppressOutbound(
  input: {
    leadStatus?: LeadStatus | null;
    replyDetectedAt?: Date | string | null;
    unsubscribedAt?: Date | string | null;
  },
  options: { followUp?: boolean } = { followUp: true },
) {
  if (input.unsubscribedAt) return true;
  if (!options.followUp) return input.leadStatus === 'lost';
  if (input.replyDetectedAt) return true;
  return input.leadStatus
    ? STOP_FOLLOW_UP_STATUSES.has(input.leadStatus)
    : false;
}

export function statusAfterDetectedReply(
  current: LeadStatus | null | undefined,
): LeadStatus {
  if (!current) return 'replied';
  if (current === 'lost' || current === 'won') return current;
  return STAGE_RANK[current] >= STAGE_RANK.replied ? current : 'replied';
}

export function statusAfterSuccessfulSend(
  current: LeadStatus | null | undefined,
): LeadStatus {
  return !current || current === 'new' ? 'contacted' : current;
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as string[]).includes(value);
}
