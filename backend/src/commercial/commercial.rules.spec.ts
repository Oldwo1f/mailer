import {
  shouldSuppressOutbound,
  statusAfterDetectedReply,
  statusAfterSuccessfulSend,
} from './commercial.rules';

describe('commercial rules', () => {
  it('stops follow-ups after a detected reply', () => {
    expect(
      shouldSuppressOutbound({
        leadStatus: 'contacted',
        replyDetectedAt: new Date(),
      }),
    ).toBe(true);
  });

  it('keeps a first-contact lead sendable', () => {
    expect(
      shouldSuppressOutbound({
        leadStatus: 'new',
        replyDetectedAt: null,
        unsubscribedAt: null,
      }),
    ).toBe(false);
  });

  it('allows a deliberately approved new campaign after an earlier reply', () => {
    expect(
      shouldSuppressOutbound(
        {
          leadStatus: 'replied',
          replyDetectedAt: new Date(),
          unsubscribedAt: null,
        },
        { followUp: false },
      ),
    ).toBe(false);
  });

  it('never sends a new campaign to an unsubscribed or lost lead', () => {
    expect(
      shouldSuppressOutbound(
        { leadStatus: 'replied', unsubscribedAt: new Date() },
        { followUp: false },
      ),
    ).toBe(true);
    expect(
      shouldSuppressOutbound(
        { leadStatus: 'lost', unsubscribedAt: null },
        { followUp: false },
      ),
    ).toBe(true);
  });

  it('moves a new lead to contacted after a send', () => {
    expect(statusAfterSuccessfulSend('new')).toBe('contacted');
  });

  it('does not downgrade advanced pipeline stages on reply', () => {
    expect(statusAfterDetectedReply('meeting')).toBe('meeting');
    expect(statusAfterDetectedReply('contacted')).toBe('replied');
  });
});
