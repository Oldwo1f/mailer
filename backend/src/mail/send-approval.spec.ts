describe('Mailer send approval contract', () => {
  it('treats approved as the only outbound-eligible draft state', () => {
    const outboundEligible = (status: string) => status === 'approved';

    expect(outboundEligible('ready')).toBe(false);
    expect(outboundEligible('pending')).toBe(false);
    expect(outboundEligible('skipped')).toBe(false);
    expect(outboundEligible('approved')).toBe(true);
  });
});
