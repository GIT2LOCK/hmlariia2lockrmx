const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GlpiSearchResult {
  totalcount: number;
  data?: Array<Record<string, unknown>>;
}

async function fetchWithRetry(url: string, opts: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, opts)
    } catch (err) {
      console.error(`fetchWithRetry attempt ${i + 1} failed for ${url}:`, err)
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      else throw err
    }
  }
  throw new Error('fetchWithRetry: unreachable')
}

async function initSession(glpiUrl: string, appToken: string, userToken: string): Promise<string> {
  const res = await fetchWithRetry(`${glpiUrl}/initSession`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'App-Token': appToken,
      'Authorization': `user_token ${userToken}`,
    },
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`initSession failed: ${res.status} ${errBody}`)
  }
  const { session_token } = await res.json()
  return session_token
}

async function searchTickets(
  glpiUrl: string,
  headers: Record<string, string>,
  criteria: Record<string, string>,
  forcedisplay: string[],
  range = '0-499'
): Promise<GlpiSearchResult> {
  const params = new URLSearchParams({ ...criteria, range })
  forcedisplay.forEach((f, i) => params.set(`forcedisplay[${i}]`, f))
  
  const res = await fetch(`${glpiUrl}/search/Ticket?${params}`, { headers })
  if (!res.ok) {
    const body = await res.text()
    console.error('Search error:', res.status, body)
    return { totalcount: 0, data: [] }
  }
  return await res.json()
}

async function fetchAllOpenTickets(
  glpiUrl: string,
  headers: Record<string, string>
): Promise<Array<Record<string, unknown>>> {
  const allTickets: Array<Record<string, unknown>> = []
  
  // Fetch tickets with status NOT solved(5) and NOT closed(6)
  // Using the simpler Ticket listing endpoint with expand_dropdowns for readable entity names
  const statusesToFetch = [1, 2, 3, 4] // new, assigned, planned, pending
  
  for (const status of statusesToFetch) {
    let start = 0
    const batchSize = 999
    
    while (true) {
      const url = `${glpiUrl}/Ticket?searchText[status]=${status}&range=${start}-${start + batchSize}`
      console.log('Fetching:', url)
      
      let res: Response
      try {
        res = await fetchWithRetry(url, { headers })
      } catch (err) {
        console.error(`All retries failed for status=${status}, skipping:`, err)
        break
      }
      
      if (!res.ok) {
        const body = await res.text()
        console.error(`Ticket fetch error (status=${status}):`, res.status, body)
        break
      }
      
      const data = await res.json()
      
      if (Array.isArray(data)) {
        allTickets.push(...data)
        if (data.length < batchSize) break
      } else if (data && typeof data === 'object') {
        // Sometimes GLPI returns an object with numeric keys
        const items = Object.values(data).filter(v => typeof v === 'object' && v !== null)
        if (items.length > 0) {
          allTickets.push(...items as Array<Record<string, unknown>>)
        }
        break
      } else {
        break
      }
      
      start += batchSize + 1
    }
  }
  
  // Filter out tickets with "vConnector", starting with "[Problem]" or "[Resolved]"
  return allTickets.filter(t => {
    const name = String(t['name'] ?? t['title'] ?? '').toLowerCase()
    if (name.includes('vconnector')) return false
    if (name.startsWith('[problem]')) return false
    if (name.startsWith('[resolved]')) return false
    return true
  })
}

// Fetch ALL tickets opened in last N days (any status, for charts)
async function fetchAllTicketsOpenedInPeriod(
  glpiUrl: string,
  headers: Record<string, string>,
  days: number
): Promise<Array<Record<string, unknown>>> {
  const allTickets: Array<Record<string, unknown>> = []
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  
  let start = 0
  const batchSize = 999
  
  while (true) {
    const params = new URLSearchParams({
      'criteria[0][field]': '15',
      'criteria[0][searchtype]': 'morethan',
      'criteria[0][value]': sinceStr,
      'forcedisplay[0]': '1',
      'forcedisplay[1]': '15',
      'forcedisplay[2]': '12',
      'forcedisplay[3]': '80',
      'range': `${start}-${start + batchSize}`,
    })
    
    let res: Response
    try {
      res = await fetchWithRetry(`${glpiUrl}/search/Ticket?${params}`, { headers })
    } catch (err) {
      console.error('Chart tickets fetch failed:', err)
      break
    }
    
    if (!res.ok) break
    
    const json = await res.json()
    const data = json.data
    
    if (Array.isArray(data) && data.length > 0) {
      allTickets.push(...data)
      if (data.length < batchSize) break
    } else {
      break
    }
    
    start += batchSize + 1
  }
  
  console.log(`Fetched ${allTickets.length} total tickets for chart (last ${days} days)`)
  
  return allTickets.filter(t => {
    const name = String(t['1'] ?? t['name'] ?? '').toLowerCase()
    if (name.includes('vconnector')) return false
    if (name.startsWith('[problem]')) return false
    if (name.startsWith('[resolved]')) return false
    // Also filter by ticket name field 2 if present
    const name2 = String(t['name'] ?? '').toLowerCase()
    if (name2.includes('vconnector') || name2.startsWith('[problem]') || name2.startsWith('[resolved]')) return false
    return true
  })
}

// Map entity name from search API to entity key
function getEntityKeyFromName(entityName: string): string {
  const upper = entityName.toUpperCase()
  if (upper.includes('GOODSTORAGE') || upper.includes('GS ') || upper.includes('GS-')) return '8'
  if (upper.includes('PETCARE') || upper.includes('PET ') || upper.includes('TECSA')) return '7'
  if (upper.includes('BRAVA') || upper.includes('POLO ')) return '1'
  return 'indefinido'
}

// GLPI statuses: 1=new, 2=assigned, 3=planned, 4=pending, 5=solved, 6=closed
function mapStatus(status: number | string): string {
  const s = Number(status)
  if (s === 1) return 'novo'
  if (s === 2 || s === 3) return 'em_andamento'
  if (s === 4) return 'pendente'
  return 'outro'
}

const KNOWN_ENTITIES: Record<string, string> = { '8': 'GoodStorage', '7': 'PetCare', '1': 'Brava' }

// Build entity-to-group mapping by fetching GLPI entity tree with expanded names
async function buildEntityMap(glpiUrl: string, headers: Record<string, string>): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  try {
    const res = await fetch(`${glpiUrl}/Entity?range=0-999&expand_dropdowns=true`, { headers })
    if (!res.ok) {
      console.error('Entity fetch failed:', res.status)
      return map
    }
    const entities = await res.json()
    const list = Array.isArray(entities) ? entities : Object.values(entities).filter(v => typeof v === 'object' && v !== null)
    
    for (const entity of list as Array<Record<string, unknown>>) {
      const id = String(entity['id'] ?? '')
      const completename = String(entity['completename'] ?? entity['name'] ?? '').toUpperCase()
      
      if (completename.includes('GOODSTORAGE') || completename.includes('GS ')) {
        map[id] = '8'
      } else if (completename.includes('PETCARE') || completename.includes('PET ') || completename.includes('TECSA')) {
        map[id] = '7'
      } else if (completename.includes('BRAVA') || completename.includes('POLO ')) {
        map[id] = '1'
      }
      // else: not mapped, will be 'indefinido'
    }
    console.log('Entity map built:', JSON.stringify(map))
  } catch (e) {
    console.error('Failed to build entity map:', e)
  }
  return map
}

function getEntityKey(entityId: string, entityMap: Record<string, string>): string {
  if (entityMap[entityId]) return entityMap[entityId]
  return 'indefinido'
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
    const sessionToken = await initSession(GLPI_URL, APP_TOKEN, USER_TOKEN)

    const glpiHeaders = {
      'Content-Type': 'application/json',
      'App-Token': APP_TOKEN,
      'Session-Token': sessionToken,
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list'

    let result: unknown

    if (action === 'ticket-counts') {
      // Change to all entities
      try {
        await fetchWithRetry(`${GLPI_URL}/changeActiveEntities`, {
          method: 'POST',
          headers: glpiHeaders,
          body: JSON.stringify({ entities_id: 'all', is_recursive: true }),
        })
      } catch (err) {
        console.error('changeActiveEntities failed, continuing:', err)
      }

      const allTickets = await fetchAllOpenTickets(GLPI_URL, glpiHeaders)
      const entityMap = await buildEntityMap(GLPI_URL, glpiHeaders)
      console.log('Fetched open tickets:', allTickets.length)
      if (allTickets.length > 0) {
        console.log('Sample ticket keys:', JSON.stringify(Object.keys(allTickets[0])))
        console.log('Sample ticket:', JSON.stringify(allTickets[0]))
      }

      // Aggregate by entity
      const byEntity: Record<string, number> = {}
      // Aggregate by status per entity: { novo: { '8': 2, '7': 1 }, em_andamento: {...} }
      const byStatusEntity: Record<string, Record<string, number>> = {
        novo: {},
        em_andamento: {},
        pendente: {},
      }

      // For pie chart: total per entity
      const entityTotals: Record<string, number> = {}

      for (const ticket of allTickets) {
        // Direct API returns 'entities_id' (or entity name if expand_dropdowns), 'status', 'date'
        const rawEntity = String(ticket['entities_id'] ?? ticket['entities_id'] ?? ticket['80'] ?? 'unknown')
        const entityKey = getEntityKey(rawEntity, entityMap)
        const status = mapStatus((ticket['status'] ?? ticket['12']) as number)

        byEntity[rawEntity] = (byEntity[rawEntity] || 0) + 1
        entityTotals[entityKey] = (entityTotals[entityKey] || 0) + 1

        if (byStatusEntity[status]) {
          byStatusEntity[status][entityKey] = (byStatusEntity[status][entityKey] || 0) + 1
        }
      }

      // Fetch ALL tickets opened in last 7 days (any status) for chart
      const chartTickets = await fetchAllTicketsOpenedInPeriod(GLPI_URL, glpiHeaders, 7)
      console.log('Chart tickets (all statuses, 7d):', chartTickets.length)

      // Aggregate by opening date for last 7 days
      const now = new Date()
      const last7Days: Record<string, number> = {}
      const last24Hours: Record<string, number> = {}
      
      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const key = d.toISOString().split('T')[0]
        last7Days[key] = 0
      }

      // Initialize last 24 hours
      for (let i = 23; i >= 0; i--) {
        const h = new Date(now)
        h.setHours(h.getHours() - i, 0, 0, 0)
        const key = `${String(h.getHours()).padStart(2, '0')}:00`
        last24Hours[key] = 0
      }

      // Count chart tickets by date (search API returns field '15' for date)
      for (const ticket of chartTickets) {
        const dateStr = String(ticket['15'] ?? ticket['date'] ?? '')
        if (!dateStr) continue
        const ticketDate = new Date(dateStr)
        const dateKey = ticketDate.toISOString().split('T')[0]
        if (last7Days[dateKey] !== undefined) {
          last7Days[dateKey]++
        }
        
        const diffHours = (now.getTime() - ticketDate.getTime()) / (1000 * 60 * 60)
        if (diffHours <= 24) {
          const hourKey = `${String(ticketDate.getHours()).padStart(2, '0')}:00`
          if (last24Hours[hourKey] !== undefined) {
            last24Hours[hourKey]++
          }
        }
      }

      // Per-entity last 7 days for line chart
      const last7DaysByEntity: Record<string, Record<string, number>> = {}
      for (const entityKey of ['1', '7', '8', 'indefinido']) {
        last7DaysByEntity[entityKey] = {}
        for (const d of Object.keys(last7Days)) {
          last7DaysByEntity[entityKey][d] = 0
        }
      }
      for (const ticket of chartTickets) {
        const dateStr = String(ticket['15'] ?? ticket['date'] ?? '')
        if (!dateStr) continue
        const dateKey = new Date(dateStr).toISOString().split('T')[0]
        const entityKey = getEntityKeyFromName(String(ticket['80'] ?? ''))
        if (last7DaysByEntity[entityKey] && last7DaysByEntity[entityKey][dateKey] !== undefined) {
          last7DaysByEntity[entityKey][dateKey]++
        }
      }

      result = {
        totalOpen: allTickets.length,
        byEntity,
        entityTotals,
        byStatusEntity,
        last7Days,
        last7DaysByEntity,
        last24Hours,
        fetchedAt: new Date().toISOString(),
      }
    } else if (action === 'get') {
      const itemId = url.searchParams.get('id') || ''
      const res = await fetch(`${GLPI_URL}/KnowbaseItem/${itemId}`, { headers: glpiHeaders })
      if (!res.ok) throw new Error(`GLPI returned ${res.status}`)
      result = await res.json()
    } else if (action === 'search') {
      const search = url.searchParams.get('search') || ''
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = 20
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
      const page = parseInt(url.searchParams.get('page') || '1')
      const perPage = 20
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
