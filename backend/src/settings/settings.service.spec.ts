import { SettingsService } from './settings.service';

describe('SettingsService DB-managed secrets', () => {
  function makeService(
    values: Record<string, string | number | boolean | null> = {},
    env: Record<string, string> = {},
  ) {
    const row = { id: 'default', values: { ...values } };
    const repo = {
      findOneBy: jest.fn().mockImplementation(async () => row),
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockImplementation(async (input) => {
        row.values = { ...(input.values || {}) };
        return input;
      }),
    };
    const config = {
      get: jest.fn((key: string) => env[key]),
    };

    return {
      service: new SettingsService(repo as never, config as never),
      repo,
      row,
    };
  }

  it('uses a DB secret in production and keeps env as fallback only', async () => {
    const { service } = makeService(
      { openaiApiKey: 'db-openai-key' },
      { NODE_ENV: 'production', OPENAI_API_KEY: 'env-openai-key' },
    );

    await expect(service.getSecret('openaiApiKey')).resolves.toBe(
      'db-openai-key',
    );
  });

  it('falls back to environment when the DB has no secret', async () => {
    const { service } = makeService({}, {
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'env-openai-key',
    });

    await expect(service.getSecret('openaiApiKey')).resolves.toBe(
      'env-openai-key',
    );
  });

  it('allows the Config page to persist secrets in production', async () => {
    const { service, repo } = makeService(
      { openaiApiKey: 'existing-openai-key' },
      { NODE_ENV: 'production' },
    );
    jest.spyOn(service, 'getPublic').mockResolvedValue({} as never);

    await service.update({ tavilyApiKey: 'new-tavily-key' });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          openaiApiKey: 'existing-openai-key',
          tavilyApiKey: 'new-tavily-key',
        }),
      }),
    );
  });
});
