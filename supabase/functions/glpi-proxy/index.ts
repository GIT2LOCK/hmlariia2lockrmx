const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const GLPI_URL = Deno.env.get('GLPI_API_URL')
  const APP_TOKEN = Deno.env.get('GLPI_APP_TOKEN')
  const USER_TOKEN = Deno.env.get('GLPI_USER_TOKEN')

  if (!GLPI_URL || !APP_TOKEN || !USER_TOKEN) {
    return new Response(JSON.stringify({ error: 'GLPI credentials not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // Init session
    const initRes = await fetch(`${GLPI_URL}/initSession`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': APP_TOKEN,
        'Authorization': `user_token ${USER_TOKEN}`,
      },
    })

    if (!initRes.ok) {
      const errBody = await initRes.text()
      console.error('GLPI initSession failed:', initRes.status, errBody)
      return new Response(JSON.stringify({ error: 'Failed to authenticate with GLPI', details: errBody }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { session_token } = await initRes.json()

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list'
    const search = url.searchParams.get('search') || ''
    const itemId = url.searchParams.get('id') || ''
    const page = parseInt(url.searchParams.get('page') || '1')
    const perPage = 20

    const glpiHeaders = {
      'Content-Type': 'application/json',
      'App-Token': APP_TOKEN,
      'Session-Token': session_token,
    }

    let result: unknown

    if (action === 'get' && itemId) {
      // Get single article
      const res = await fetch(`${GLPI_URL}/KnowbaseItem/${itemId}`, { headers: glpiHeaders })
      if (!res.ok) {
        throw new Error(`GLPI returned ${res.status}`)
      }
      result = await res.json()
    } else if (action === 'search' && search) {
      // Search articles
      const searchParams = new URLSearchParams({
        'criteria[0][field]': '6', // name field
        'criteria[0][searchtype]': 'contains',
        'criteria[0][value]': search,
        'criteria[1][link]': 'OR',
        'criteria[1][field]': '7', // answer/content field
        'criteria[1][searchtype]': 'contains',
        'criteria[1][value]': search,
        'range': `${(page - 1) * perPage}-${page * perPage - 1}`,
        'forcedisplay[0]': '2', // id
        'forcedisplay[1]': '6', // name
        'forcedisplay[2]': '7', // answer
        'forcedisplay[3]': '3', // date
      })
      const res = await fetch(`${GLPI_URL}/search/KnowbaseItem?${searchParams}`, { headers: glpiHeaders })
      if (!res.ok) {
        throw new Error(`GLPI search returned ${res.status}`)
      }
      result = await res.json()
    } else {
      // List articles
      const res = await fetch(`${GLPI_URL}/KnowbaseItem?range=${(page - 1) * perPage}-${page * perPage - 1}&order=DESC&sort=3`, { headers: glpiHeaders })
      if (!res.ok) {
        throw new Error(`GLPI list returned ${res.status}`)
      }
      result = await res.json()
    }

    // Kill session
    await fetch(`${GLPI_URL}/killSession`, { method: 'GET', headers: glpiHeaders }).catch(() => {})

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: unknown) {
    console.error('GLPI proxy error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
