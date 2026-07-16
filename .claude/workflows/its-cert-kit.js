export const meta = {
  name: 'its-cert-kit',
  description: '為 ITS/Certiport 證照產出調研文件＋驗證過題庫＋自測網站；或以 expand 模式擴充既有證照題庫',
  whenToUse: '① 新證照：args 傳主題字串或 {topic, slug, lang, perDomain}，跑完整流程。② 擴充題庫：args={mode:"expand", slug:"javascript", perDomain:20, topic?}，只補題並實跑驗證後併回既有網站，不重跑調研。',
  phases: [
    { title: 'Research' },
    { title: 'Docs' },
    { title: 'Generate' },
    { title: 'Verify' },
    { title: 'Assemble' },
    { title: 'Website' },
    { title: 'Report' },
    { title: 'Load' },
    { title: 'Rebuild' },
  ],
}

// ---------- 參數 ----------
// args 可為物件、或（容錯）JSON 字串、或純主題字串
let A = {}
if (args && typeof args === 'object') A = args
else if (typeof args === 'string') { try { A = JSON.parse(args) } catch { A = { topic: args } } }
const topic = A.topic || 'ITS Python'
const lang = A.lang || (/python/i.test(topic) ? 'python' : /java(?!script)/i.test(topic) ? 'java' : 'javascript') // 驗證用的執行語言
const perDomain = A.perDomain || 28
const EDU = '/Users/kais/WS/kais/educational/its-python-cert' // 多證照 repo 根
const slug = A.slug || topic.replace(/it\s*specialist|certiport|its/gi, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const baseDir = `${EDU}/${slug}` // 新證照落在 repo 子資料夾（如 python/、javascript/）
const REF = `${EDU}/python` // 沿用 Python 版當格式/設計範本

log(`證照：${topic}｜輸出資料夾：${baseDir}｜每領域題數：${perDomain}｜驗證語言：${lang}`)

// ---------- Schemas ----------
const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    examFormat: {
      type: 'object', additionalProperties: false,
      properties: {
        code: { type: 'string' }, questions: { type: 'string' }, time: { type: 'string' },
        pass: { type: 'string' }, language: { type: 'string' }, fee: { type: 'string' }, notes: { type: 'string' },
      },
    },
    domains: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          n: { type: 'integer' }, name: { type: 'string' }, weight: { type: 'string' },
          weightPct: { type: 'number' }, subObjectives: { type: 'array', items: { type: 'string' } },
          topics: { type: 'string' },
        }, required: ['n', 'name', 'topics'],
      },
    },
    sources: { type: 'array', items: { type: 'string' } },
  }, required: ['domains', 'examFormat'],
}
const RES_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    tiers: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { tier: { type: 'string' }, name: { type: 'string' }, note: { type: 'string' }, url: { type: 'string' } },
        required: ['tier', 'name', 'note'],
      },
    },
    localInfo: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } },
  }, required: ['tiers'],
}
const Q_ITEM = {
  type: 'object', additionalProperties: false,
  properties: {
    domain: { type: 'integer' },
    stem: { type: 'string' },
    code: { type: 'string' },
    options: { type: 'object', additionalProperties: { type: 'string' } }, // {A,B,C,D}
    answer: { type: 'array', items: { type: 'string' } },
    multi: { type: 'boolean' },
    explanation: { type: 'string' },        // 精簡解析（答對也看得到）
    explanationWrong: { type: 'string' },    // 詳盡：逐個誤答為何錯 + 觀念
    runnable: { type: 'boolean' },           // 是否可用程式碼實跑驗證
    runOutput: { type: 'string' },           // 驗證階段填入實跑輸出
  }, required: ['domain', 'stem', 'options', 'answer', 'explanation', 'explanationWrong'],
}
const Q_SCHEMA = { type: 'object', additionalProperties: false, properties: { questions: { type: 'array', items: Q_ITEM } }, required: ['questions'] }

// =====================================================================
// 擴充模式：args.mode='expand' → 只補題並併回既有網站，不重跑調研
// 例：args = { mode:'expand', slug:'javascript', perDomain:20, topic:'ITS JavaScript' }
if (A.mode === 'expand') {
  if (!A.slug) throw new Error('expand 模式需要 args.slug（要擴充的證照子資料夾，如 "javascript"）')
  const target = A.perDomain || 20
  const certDir = `${EDU}/${A.slug}`
  const xlang = A.lang || (/javascript|js/i.test(A.slug) ? 'javascript' : /java/i.test(A.slug) ? 'java' : /python|py/i.test(A.slug) ? 'python' : lang)
  log(`擴充模式：${certDir} → 每領域補到 ${target} 題（驗證語言 ${xlang}）`)

  phase('Load')
  const cur = await agent(
    `請 Read ${certDir}/index.html，從其 <script> 內的 const domains=[...] 與 const Q=[...] 解析出：\n` +
    `- domains：每個 {n,name}\n- perDomainCount：各領域現有題數，如 {"1":6,"2":6,...}\n- stems：現有所有題目的 stem 陣列（供避免重複）\n- maxId：目前最大題號。\n只輸出結構化結果。`,
    { label: 'expand:load', phase: 'Load', schema: {
      type: 'object', additionalProperties: false, properties: {
        domains: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { n: { type: 'integer' }, name: { type: 'string' } }, required: ['n', 'name'] } },
        perDomainCount: { type: 'object', additionalProperties: { type: 'integer' } },
        stems: { type: 'array', items: { type: 'string' } },
        maxId: { type: 'integer' },
      }, required: ['domains', 'perDomainCount', 'maxId'],
    } }
  )

  phase('Generate')
  const need = cur.domains.map(d => ({ d, add: Math.max(0, target - (cur.perDomainCount[String(d.n)] || 0)) })).filter(x => x.add > 0)
  if (!need.length) { log('各領域已達目標，無需補題'); return { mode: 'expand', slug: A.slug, added: 0, target } }
  const gen = await parallel(need.map(x => () =>
    agent(
      `你是 ${A.topic || A.slug} 命題老師。為「領域 ${x.d.n}：${x.d.name}」再出 ${x.add} 題原創單選/複選題（禁抄真題、勿與現有題重複）。\n` +
      `現有題幹（避免重複）：${JSON.stringify(cur.stems.slice(0, 400))}\n` +
      `每題 domain=${x.d.n}；可執行語法題放 code 並 runnable=true；options {A,B,C,D}；answer 正解鍵陣列；multi 複選才 true；explanation 精簡解析；explanationWrong 詳盡（逐一說明誤答為何錯＋帶出觀念，至少 3 句）。\n` +
      `可用 ToolSearch 載入 Bash 先跑 ${xlang} 自我驗證答案。只輸出 questions。`,
      { label: `expand:gen:D${x.d.n}`, phase: 'Generate', schema: Q_SCHEMA }
    ).then(r => ({ d: x.d, questions: (r && r.questions) || [] }))
  ))

  phase('Verify')
  const ver = await pipeline(gen.filter(Boolean),
    g => agent(
      `你是嚴格的答案驗證官。以下為「領域 ${g.d.n}」的新題，務必用 ToolSearch 載入 Bash 實跑 ${xlang} 核對每題 runnable 的答案，不符就修正（一律以實跑為準）；DOM/表單等不可執行題依官方語法/MDN 核對；強化 explanationWrong（逐一點出誤答為何錯＋觀念，至少 3 句）；刪除歧義或答案不唯一的題。回傳修正後 questions。\n${JSON.stringify(g.questions)}`,
      { label: `expand:verify:D${g.d.n}`, phase: 'Verify', schema: Q_SCHEMA, effort: 'high' }
    ).then(r => ({ d: g.d, questions: (r && r.questions) || [] }))
  )
  const added = ver.filter(Boolean).flatMap(v => v.questions)
  log(`新增並驗證 ${added.length} 題`)

  phase('Rebuild')
  await agent(
    `把新題併入既有證照網站與題庫。新題（尚未編號）：${JSON.stringify(added)}\n` +
    `步驟（用 Read/Bash/Write）：\n` +
    `1) Read ${certDir}/index.html，取出現有 const Q=[...]。\n` +
    `2) 新題接在現有題目之後、id 從 ${cur.maxId + 1} 連續遞增；欄位轉為 {id,d,stem,code?,o,a,multi?,e}（e 取 explanation）。\n` +
    `3) 用新的完整 Q 陣列取代 index.html 的 const Q=[...]；更新所有題數文案（本站題庫 / Self Test · N 題 / mTotal / 全部 N / 練習 N 題 / 概覽 note 的 N 題）為新總數；MOCK_PLAN 各領域平均分配、合計 20（維持 mock 20 題文案）。\n` +
    `4) 產出/更新 ${certDir}/04-模擬題庫擴充.md 列出新題與解析，註明「可執行題經 ${xlang} 實跑驗證」。\n` +
    `5) 用 Bash 跑 node --check 驗證 index.html 的 <script> 語法，並確認各領域題數均衡、答案鍵合法。回報新舊題數與檔案。`,
    { label: 'expand:rebuild', phase: 'Rebuild', effort: 'high' }
  )

  return { mode: 'expand', slug: A.slug, added: added.length, target, note: '新題已實跑驗證並併入網站；請人工抽查 index.html 與擴充題庫。' }
}

// =====================================================================
phase('Research')
// 四路平行調研：官方考綱/權重、資源與題庫、在地資訊、各領域知識細節
const research = await agent(
  `你是證照調研員。主題：「${topic}」。用 ToolSearch 載入 WebSearch/WebFetch 上網查證（官方 Certiport Objective Domains、CodeHS 標準框架、GMetrix、代理商）。\n` +
  `任務：彙整這張證照的「考試規格」與「考試領域（Objective Domains）」。\n` +
  `- examFormat：考科代碼、題數、時間、通過分、語言、費用（查不到就留空字串，別杜撰）。\n` +
  `- domains：完整列出各領域（n 從 1 起）、名稱、權重（weight 字串如 "20-25%"、weightPct 取中位數數字；官方沒列權重就依官方練習題題數分布推估並在 topics 註明「近似」）、subObjectives（官方子目標逐條）、topics（該領域涵蓋的具體技術主題，用頓號分隔）。\n` +
  `- sources：你實際引用的 URL。\n` +
  `務必以官方與 CodeHS 為主幹交叉驗證，數字有出入就標「以官方為準」。只輸出結構化結果。`,
  { label: 'research:exam', phase: 'Research', schema: RESEARCH_SCHEMA }
)
const resources = await agent(
  `你是證照備考資源調研員。主題：「${topic}」。用 ToolSearch 載入 WebSearch/WebFetch。\n` +
  `蒐集備考資源與題庫，並依可信度分三級：tier 值用 "官方/授權"、"教材/課程"、"社群/回憶題"。每筆給 name、note（一句說明＋注意事項）、url。\n` +
  `務必包含：官方授權模擬（GMetrix/CertPREP/MeasureUp 等）、對應中文教材、CodeHS、以及「dumps/真題販售站不建議」的警示（歸在社群/回憶題並註明風險）。\n` +
  `localInfo：台灣報名/代理商(碁峰)/費用/語言等實務。sources：引用 URL。只輸出結構化結果。`,
  { label: 'research:resources', phase: 'Research', schema: RES_SCHEMA }
)

// =====================================================================
phase('Docs')
// 依 Python 版格式寫 01 考綱、02 資源兩份 md
const domainList = research.domains.map(d => `${d.n}. ${d.name}｜權重 ${d.weight || '（近似）'}｜${d.topics}`).join('\n')
await agent(
  `你是技術文件撰寫者，語言：繁體中文。請先用 Read 參考既有範本的格式與語氣：\n` +
  `  ${REF}/01-知識範圍與考綱.md 、 ${REF}/02-題庫與資源彙整.md\n` +
  `然後為「${topic}」產出兩份對應文件，寫到（用 Write）：\n` +
  `  ${baseDir}/01-知識範圍與考綱.md\n  ${baseDir}/02-題庫與資源彙整.md\n` +
  `01 內容用以下調研結果（考試規格＋各領域與子目標＋權重＋能力 checklist＋來源）：\n` +
  `EXAM_FORMAT=${JSON.stringify(research.examFormat)}\nDOMAINS=${JSON.stringify(research.domains)}\nSOURCES=${JSON.stringify(research.sources || [])}\n` +
  `02 內容用以下資源分級（三級可信度表格＋台灣實務＋來源＋「dumps 不建議」警示）：\n` +
  `RESOURCES=${JSON.stringify(resources)}\n` +
  `格式、標題結構、免責聲明（官方不公開真題、以官方 Objective Domains 為準）都比照範本。完成後回報寫了哪些檔。`,
  { label: 'docs:write', phase: 'Docs' }
)

// =====================================================================
phase('Generate')
// 每個領域一支代理，依權重出 perDomain 題（初稿）
const genByDomain = await parallel(research.domains.map(d => () =>
  agent(
    `你是 ${topic} 命題老師。針對「領域 ${d.n}：${d.name}」出 ${perDomain} 題原創單選/複選題（禁止抄真題）。\n` +
    `涵蓋主題：${d.topics}\n子目標：${(d.subObjectives || []).join('；')}\n` +
    `每題：domain=${d.n}；stem 題幹；可執行的語法題放 code（純${lang}程式碼字串）並設 runnable=true；options 為 {A,B,C,D}；answer 是正解鍵陣列；multi 複選才 true；\n` +
    `explanation=精簡解析；explanationWrong=詳盡解說（逐一說明每個誤答選項為何錯，並帶出該領域觀念，至少 3 句）。\n` +
    `難度對齊入門級證照（重讀懂與除錯）。可用 ToolSearch 載入 Bash 先自己跑 ${lang} 確認答案再交。只輸出結構化 questions。`,
    { label: `gen:D${d.n}`, phase: 'Generate', schema: Q_SCHEMA }
  ).then(r => ({ d, questions: (r && r.questions) || [] }))
))

// =====================================================================
phase('Verify')
// 每個領域一支「驗證＋補強」代理：必須實跑程式碼核對答案，並確保錯誤講解詳盡
const verified = await pipeline(genByDomain.filter(Boolean),
  (g) => agent(
    `你是嚴格的答案驗證官（對抗式）。以下是「領域 ${g.d.n}：${g.d.name}」的 ${g.questions.length} 題草稿。\n` +
    `逐題檢查，務必用 ToolSearch 載入 Bash：對每一題 runnable=true 的題目，實際用 ${lang} 執行其 code/運算式，把真實輸出寫進 runOutput，並確認 answer 與真實輸出一致；不一致就修正 answer 或選項（嚴禁憑印象，一律以實跑為準）。\n` +
    `對 DOM/事件/表單等無法純執行的題目，依官方語法/MDN 核對正確性。\n` +
    `同時強化 explanationWrong：必須逐一點出每個誤答選項錯在哪、並帶出正確觀念（至少 3 句、具體不空泛）。\n` +
    `刪除有歧義或答案不唯一的題。回傳修正後的 questions（沿用 Q schema，含 runOutput）。\n` +
    `題目草稿：${JSON.stringify(g.questions)}`,
    { label: `verify:D${g.d.n}`, phase: 'Verify', schema: Q_SCHEMA, effort: 'high' }
  ).then(r => ({ d: g.d, questions: (r && r.questions) || [] }))
)

// 攤平＋補上穩定遞增 id
const allQ = []
let id = 1
for (const v of verified.filter(Boolean)) for (const q of v.questions) allQ.push({ id: id++, ...q })
log(`驗證後題數：${allQ.length}（各領域約 ${perDomain}）`)

// =====================================================================
phase('Assemble')
// 把題庫寫成 markdown，並輸出 _questions.json 供網站使用
await agent(
  `你是題庫整理者，語言繁體中文。請先 Read 範本 ${REF}/03-模擬題與解析.md 學格式。\n` +
  `以下是 ${topic} 已驗證題庫（${allQ.length} 題，含 domain/stem/code/options/answer/explanation/explanationWrong/runOutput）：\n${JSON.stringify(allQ)}\n` +
  `請用 Write 產出：\n` +
  `1) ${baseDir}/03-模擬題庫與解析.md — 依領域分節列題＋解析表（答案、精簡解析、詳盡錯誤解說），並註明「已用 ${lang} 實跑驗證」。\n` +
  `2) ${baseDir}/_questions.json — 純 JSON 陣列，元素為 {id,d(=domain),stem,code,o(=options),a(=answer),multi,e(=explanation),ew(=explanationWrong)}，供網站載入。\n` +
  `完成後回報題數與檔案路徑。`,
  { label: 'assemble', phase: 'Assemble' }
)

// =====================================================================
phase('Website')
// 沿用 Python 版 index.html 設計，換成本證照的領域與題庫
const domainMeta = research.domains.map(d => ({ n: d.n, name: d.name, weight: d.weight || '近似', pct: d.weightPct || Math.round(100 / research.domains.length) }))
await agent(
  `你是前端工程師。請 Read 既有網站範本 ${REF}/index.html（單頁自測 Hub：深淺色主題、六大領域權重、練習模式即時對答、隨機抽題計時模擬考、一次一題導覽＋題號跳格、答錯顯示「你選的 vs 正解＋解析＋觀念提醒」）。\n` +
  `請以它為藍本，做出 ${topic} 版寫到 ${baseDir}/index.html：\n` +
  `- 讀取 ${baseDir}/_questions.json 的題庫並內嵌成 JS 的 Q 陣列（欄位對應 id,d,stem,code,o,a,multi,e；答錯詳解用 ew 欄位，若無則沿用觀念提醒）。\n` +
  `- 領域資料改成：${JSON.stringify(domainMeta)}（共 ${domainMeta.length} 個領域，篩選鈕與模擬考抽題依此）。\n` +
  `- 計時模擬考：依各領域權重 pct 分配抽題、合計 20 題、限時 25 分鐘、交卷評分並揭曉詳解。\n` +
  `- 答錯回饋務必用該題 ew（詳盡錯誤解說）優先顯示，其次才是領域觀念提醒。\n` +
  `- 保留：主題切換、單題導覽（上/下一題＋題號跳格記住狀態）、過關判定（≥70%）與各領域強弱長條。\n` +
  `- 標題與題庫數量換成本證照實際值。務必自我檢查 HTML/JS 可執行（可用 ToolSearch 載入 Bash 跑 node --check 驗證 script 區塊語法）。完成後回報。`,
  { label: 'website', phase: 'Website', effort: 'high' }
)

// =====================================================================
phase('Report')
const domainsCsv = research.domains.map(d => `D${d.n} ${d.name}(${d.weight || '近似'})`).join('、')
return {
  topic, slug, baseDir,
  domains: research.domains.length,
  domainsSummary: domainsCsv,
  questionCount: allQ.length,
  perDomain,
  files: [
    `${baseDir}/01-知識範圍與考綱.md`,
    `${baseDir}/02-題庫與資源彙整.md`,
    `${baseDir}/03-模擬題庫與解析.md`,
    `${baseDir}/_questions.json`,
    `${baseDir}/index.html`,
    `${baseDir}/server.js`,
  ],
  note: '題目答案已於 Verify 階段以實跑核對；錯誤解說已逐題強化。請人工抽查 index.html 與 03 題庫後再對外分享。',
}
