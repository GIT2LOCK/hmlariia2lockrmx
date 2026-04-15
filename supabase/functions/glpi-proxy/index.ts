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

    if (action === 'ticket-counts') {
      // Change active entity to "all" so we see all entities
      const entityRes = await fetch(`${GLPI_URL}/changeActiveEntities`, {
        method: 'POST',
        headers: glpiHeaders,
        body: JSON.stringify({ entities_id: 'all', is_recursive: true }),
      })
      console.log('changeActiveEntities status:', entityRes.status)
      const entityBody = await entityRes.text()
      console.log('changeActiveEntities response:', entityBody)

      // Search for open tickets (status not equals 5 AND status not equals 6)
      // GLPI statuses: 1=new, 2=assigned, 3=planned, 4=pending, 5=solved, 6=closed
      // forcedisplay: 2=id, 80=entity, 12=status
      const allTickets: Array<Record<string, unknown>> = []
      let start = 0
      const batchSize = 200
      let totalCount = -1

      while (totalCount === -1 || start < totalCount) {
        const searchParams = new URLSearchParams({
          'criteria[0][field]': '12',
          'criteria[0][searchtype]': 'notequals',
          'criteria[0][value]': '5',
          'criteria[1][link]': 'AND',
          'criteria[1][field]': '12',
          'criteria[1][searchtype]': 'notequals',
          'criteria[1][value]': '6',
          'forcedisplay[0]': '2',
          'forcedisplay[1]': '80',
          'forcedisplay[2]': '12',
          'range': `${start}-${start + batchSize - 1}`,
        })

        const searchUrl = `${GLPI_URL}/search/Ticket?${searchParams}`
        console.log('Fetching tickets, range:', `${start}-${start + batchSize - 1}`)
        const res = await fetch(searchUrl, { headers: glpiHeaders })
        
        if (!res.ok) {
          const errBody = await res.text()
          console.error('GLPI ticket search error:', res.status, errBody)
          throw new Error(`GLPI ticket search returned ${res.status}`)
        }

        const searchResult = await res.json()
        console.log('Search result totalcount:', searchResult.totalcount, 'data length:', searchResult.data?.length || 0)
        
        if (start === 0 && searchResult.data?.length > 0) {
          console.log('Sample ticket:', JSON.stringify(searchResult.data[0]))
        }

        if (totalCount === -1) {
          totalCount = searchResult.totalcount || 0
        }

        if (searchResult.data && Array.isArray(searchResult.data)) {
          allTickets.push(...searchResult.data)
        } else {
          break
        }

        start += batchSize
        if (searchResult.data.length < batchSize) break
      }

      // Count by entity ID (field 80 = entity)
      const entityCounts: Record<string, number> = {}
      for (const ticket of allTickets) {
        const entityVal = String(ticket['80'] ?? 'unknown')
        entityCounts[entityVal] = (entityCounts[entityVal] || 0) + 1
      }

      console.log('Ticket counts by entity:', JSON.stringify(entityCounts))
      console.log('Total open tickets:', totalCount, 'Fetched:', allTickets.length)

      result = {
        totalOpen: allTickets.length,
        byEntity: entityCounts,
        fetchedAt: new Date().toISOString(),
      }
    } else if (action === 'get' && itemId) {
      const res = await fetch(`${GLPI_URL}/KnowbaseItem/${itemId}`, { headers: glpiHeaders })
      if (!res.ok) throw new Error(`GLPI returned ${res.status}`)
      result = await res.json()
    } else if (action === 'search' && search) {
      const searchParams = new URLSearchParams({
        'criteria[0][field]': '6',
        'criteria[0][searchtype]': 'contains',
        'criteria[0][value]': search,
        'criteria[1][link]': 'OR',
        'criteria[1][field]': '7',
        'criteria[1][searchtype]': 'contains',
        'criteria[1][value]': search,
        'range': `${(page - 1) * perPage}-${page * perPage - 1}`,
        'forcedisplay[0]': '2',
        'forcedisplay[1]': '6',
        'forcedisplay[2]': '7',
        'forcedisplay[3]': '3',
      })
      const res = await fetch(`${GLPI_URL}/search/KnowbaseItem?${searchParams}`, { headers: glpiHeaders })
      if (!res.ok) throw new Error(`GLPI search returned ${res.status}`)
      result = await res.json()
    } else {
      const listUrl = `${GLPI_URL}/KnowbaseItem?range=${(page - 1) * perPage}-${page * perPage - 1}&order=DESC&sort=id`
      const res = await fetch(listUrl, { headers: glpiHeaders })
      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`GLPI list returned ${res.status}: ${errBody}`)
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
