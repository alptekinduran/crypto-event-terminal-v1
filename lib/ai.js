const axios = require('axios');
const config = require('./config');

async function enrichWithAI(event) {
  if (!config.deepseekApiKey) {
    return {
      ...event,
      aiSummary: fallbackSummary(event),
      aiReason: fallbackReason(event)
    };
  }

  try {
    const prompt = [
      'Sen Türkçe çalışan bir kripto event terminali asistansın.',
      'Aşağıdaki olayı 2 kısa cümleyle özetle.',
      'Halüsinasyon yapma. Sadece metindeki bilgiye dayan.',
      'Ayrıca tek kısa cümlede neden trade açısından önemli olabileceğini yaz.',
      '',
      `Başlık: ${event.title}`,
      `Metin: ${event.body || ''}`,
      `Kaynak: ${event.source}`,
      `Semboller: ${event.symbols.join(', ') || 'yok'}`,
      `Tür: ${event.type}`,
      `İlk etki: ${event.impact}`
    ].join('\n');

    const response = await axios.post(
      `${config.deepseekBaseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        model: config.deepseekModel,
        messages: [
          { role: 'system', content: 'Kısa, net ve temkinli yaz.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 180
      },
      {
        timeout: 25000,
        headers: {
          Authorization: `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const text = response.data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Bos AI yaniti');

    const [summary, reason] = text.split('\n').map((x) => x.trim()).filter(Boolean);
    return {
      ...event,
      aiSummary: summary || fallbackSummary(event),
      aiReason: reason || fallbackReason(event)
    };
  } catch {
    return {
      ...event,
      aiSummary: fallbackSummary(event),
      aiReason: fallbackReason(event)
    };
  }
}

function fallbackSummary(event) {
  const symbols = event.symbols.length ? `${event.symbols.join(', ')} etkilenebilir.` : 'İlgili coin net değil.';
  return `${event.source} kaynağında ${event.type} tipi bir gelişme görüldü. ${symbols}`;
}

function fallbackReason(event) {
  return `Olay puanı ${event.score}/99 ve ilk etki ${event.impact} olarak değerlendirildi.`;
}

module.exports = { enrichWithAI };
