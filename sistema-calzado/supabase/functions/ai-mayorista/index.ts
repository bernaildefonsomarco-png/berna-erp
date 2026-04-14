// @ts-nocheck
// deno-lint-ignore-file

const GROQ_KEY = Deno.env.get('GROQ_KEY') ?? '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres un experto en marcas de calzado deportivo y casual vendido en Perú.
Tu única tarea es: dado un texto escrito por una vendedora peruana (puede tener errores ortográficos, abreviaciones o variantes), identificar a qué marca de calzado se refiere y devolver su nombre oficial correcto.

MARCAS QUE CONOCES (con sus variantes comunes):
- Nike: nike, nikes, naik, naike
- Adidas: adidas, adidass, adidahs, addidas
- Puma: puma, pumas
- New Balance: new balance, newbalance, nb, n.b.
- Reebok: reebok, rebok, ribuk, ribok, reebook, rebook
- Berna: berna, verna
- I-Run: irun, i-run, airun, i run, irum
- Vans: vans, ban, bans
- Converse: converse, converss, konverse
- Fila: fila, filla
- Skechers: skechers, skecher, sketchers, esquechers
- Champion: champion, campeón, champio

Si el texto coincide con alguna de estas marcas (incluyendo errores ortográficos o variantes), devuelve el nombre oficial.
Si NO reconoces la marca pero parece un nombre de marca (capitalizada correctamente), devuélvela capitalizada.
Si es completamente irreconocible, devuelve el texto tal cual capitalizado.

REGLA CRÍTICA: Responde ÚNICAMENTE con este JSON, sin markdown, sin explicaciones, sin texto extra:
{"marca": "NombreOficial", "reconocida": true}

Si no la reconoces:
{"marca": "TextoCapitalizado", "reconocida": false}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { texto } = await req.json();

    if (!texto?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Texto vacío' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const groqResp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,        // 0 = máxima consistencia, queremos siempre la misma respuesta
        max_tokens: 60,        // la respuesta es tiny, no necesitamos más
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: texto.trim() },
        ],
      }),
    });

    if (!groqResp.ok) {
      const err = await groqResp.text();
      throw new Error(`Groq ${groqResp.status}: ${err}`);
    }

    const groqData = await groqResp.json();
    const rawText  = groqData.choices?.[0]?.message?.content ?? '';
    const clean    = rawText.replace(/```json\n?|```/gi, '').trim();
    const parsed   = JSON.parse(clean);

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});