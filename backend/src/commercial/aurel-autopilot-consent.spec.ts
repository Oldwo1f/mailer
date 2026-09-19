import { Campaign } from '../entities/campaign.entity';

function isExplicitlyEnabled(campaign: Pick<Campaign, 'autopilotEnabled'>) {
  return campaign.autopilotEnabled === true;
}

describe('Aurel Autopilot campaign consent', () => {
  it('is disabled by default or when the flag is missing', () => {
    expect(isExplicitlyEnabled({ autopilotEnabled: false })).toBe(false);
    expect(isExplicitlyEnabled({ autopilotEnabled: undefined as unknown as boolean })).toBe(false);
  });

  it('runs only after explicit campaign opt-in', () => {
    expect(isExplicitlyEnabled({ autopilotEnabled: true })).toBe(true);
  });
});
