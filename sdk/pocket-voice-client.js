export class PocketVoiceClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'https://beta.pocketnova.app').replace(/\/$/, '');
    this.token = options.token || null;
  }

  headers() {
    const headers = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return headers;
  }

  async transcribeAudio({ audio_ref, language = 'en-US', operator_approval = false }) {
    return this.post('/voice/transcribe', { audio_ref, language, operator_approval });
  }

  async createTaskFromTranscript({ transcript, target_agent = 'agent-pocket', operator_approval = false, metadata = {} }) {
    const packet = await this.localTranscriptPacket({ transcript, target_agent, operator_approval, metadata });
    return this.post('/voice/task-packets', packet);
  }

  async post(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    const text = await res.text();
    const payload = text ? JSON.parse(text) : {};
    if (!res.ok) throw Object.assign(new Error(`Voice Pocket request failed: ${res.status}`), { status: res.status, payload });
    return payload;
  }

  async localTranscriptPacket({ transcript, target_agent = 'agent-pocket', operator_approval = false, metadata = {} }) {
    if (!transcript || !transcript.trim()) throw new Error('Transcript is required.');
    const payload = {
      schema: 'pocket.voice.task_packet.v1',
      created_at: new Date().toISOString(),
      transcript: transcript.trim(),
      target_agent,
      operator_approval,
      metadata,
      execution_status: 'not_executed_locally'
    };
    const hash = await digest(payload);
    return { ...payload, hash };
  }
}

async function digest(value) {
  const encoded = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return 'sha256:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
