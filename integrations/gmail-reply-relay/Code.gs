const PROCESSED_IDS_KEY = 'ATELYS_PROCESSED_GMAIL_MESSAGE_IDS';
const MAX_PROCESSED_IDS = 2000;

/**
 * Relay inbound replies from the Gmail inbox receiving contact@atelys-digital.com
 * to Mailer's provider-neutral reply webhook.
 *
 * Required Script Properties:
 * - MAILER_REPLY_WEBHOOK_URL
 * - MAILER_REPLY_WEBHOOK_SECRET
 * - ATELYS_REPLY_TO_ADDRESS
 */
function relayAtelysReplies() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    const config = getRelayConfig_();
    const processed = loadProcessedIds_();
    const query = `to:${config.replyToAddress} newer_than:7d`;
    const threads = GmailApp.search(query, 0, 100);
    const messages = [];

    threads.forEach((thread) => {
      thread.getMessages().forEach((message) => {
        const id = message.getId();
        if (processed.has(id)) return;

        const fromEmail = extractEmail_(message.getFrom());
        if (!fromEmail) {
          processed.add(id);
          return;
        }
        if (fromEmail.toLowerCase() === config.replyToAddress.toLowerCase()) {
          processed.add(id);
          return;
        }

        messages.push({ message, id, fromEmail });
      });
    });

    messages.sort((a, b) => a.message.getDate().getTime() - b.message.getDate().getTime());

    messages.forEach(({ message, id, fromEmail }) => {
      const response = UrlFetchApp.fetch(config.webhookUrl, {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        headers: {
          'X-Reply-Webhook-Secret': config.secret,
        },
        payload: JSON.stringify({
          fromEmail,
          receivedAt: message.getDate().toISOString(),
          subject: message.getSubject() || null,
          messageId: `gmail:${id}`,
        }),
      });

      const code = response.getResponseCode();
      if (code >= 200 && code < 300) {
        processed.add(id);
      } else {
        console.error(
          `Mailer reply webhook rejected Gmail message ${id}: HTTP ${code} ${response.getContentText()}`,
        );
      }
    });

    saveProcessedIds_(processed);
  } finally {
    lock.releaseLock();
  }
}

/** Run once after configuring Script Properties. Creates a 5-minute trigger. */
function installAtelysReplyRelay() {
  getRelayConfig_();
  removeRelayTriggers_();
  ScriptApp.newTrigger('relayAtelysReplies')
    .timeBased()
    .everyMinutes(5)
    .create();

  relayAtelysReplies();
}

function uninstallAtelysReplyRelay() {
  removeRelayTriggers_();
}

function resetAtelysReplyRelayCursor() {
  PropertiesService.getScriptProperties().deleteProperty(PROCESSED_IDS_KEY);
}

function testAtelysReplyRelayConfig() {
  const config = getRelayConfig_();
  const response = UrlFetchApp.fetch(config.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'X-Reply-Webhook-Secret': config.secret,
    },
    payload: JSON.stringify({
      fromEmail: 'reply-relay-test@invalid.example',
      receivedAt: new Date().toISOString(),
      subject: 'Atelys reply relay configuration test',
      messageId: `relay-test:${Date.now()}`,
    }),
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`Webhook test failed: HTTP ${code} ${response.getContentText()}`);
  }
  console.log(`Webhook reachable: HTTP ${code} ${response.getContentText()}`);
}

function getRelayConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = (properties.getProperty('MAILER_REPLY_WEBHOOK_URL') || '').trim();
  const secret = (properties.getProperty('MAILER_REPLY_WEBHOOK_SECRET') || '').trim();
  const replyToAddress = (properties.getProperty('ATELYS_REPLY_TO_ADDRESS') || '').trim();

  if (!/^https:\/\//i.test(webhookUrl)) {
    throw new Error('MAILER_REPLY_WEBHOOK_URL must be an HTTPS URL');
  }
  if (secret.length < 24) {
    throw new Error('MAILER_REPLY_WEBHOOK_SECRET must contain at least 24 characters');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToAddress)) {
    throw new Error('ATELYS_REPLY_TO_ADDRESS must be a valid email address');
  }

  return { webhookUrl, secret, replyToAddress };
}

function extractEmail_(fromHeader) {
  const value = String(fromHeader || '').trim();
  const bracket = value.match(/<([^>]+)>/);
  const candidate = (bracket ? bracket[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function loadProcessedIds_() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_IDS_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch (error) {
    console.warn(`Could not parse processed Gmail ids: ${error}`);
    return new Set();
  }
}

function saveProcessedIds_(ids) {
  const list = Array.from(ids);
  const trimmed = list.slice(Math.max(0, list.length - MAX_PROCESSED_IDS));
  PropertiesService.getScriptProperties().setProperty(
    PROCESSED_IDS_KEY,
    JSON.stringify(trimmed),
  );
}

function removeRelayTriggers_() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'relayAtelysReplies') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
