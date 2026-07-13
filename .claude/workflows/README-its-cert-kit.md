# Workflow：its-cert-kit

把「調研證照 → 產出考綱/題庫/資源文件 → 驗證並補全題庫 → 生成含計時模擬考的自測網站」這條重複流程固化成一支可重跑的多代理 workflow。以既有 `its-python-cert/` 的文件與網站為設計範本，確保各證照產出風格一致。

## 流程（7 phases）

| Phase | 做什麼 | 併發 |
|------|------|------|
| Research | 平行調研：官方 Objective Domains／權重／考試規格、備考資源分級、在地實務 | 2 代理並行 |
| Docs | 依範本寫 `01-知識範圍與考綱.md`、`02-題庫與資源彙整.md` | 1 |
| Generate | 每個領域一支代理，依權重出題（初稿） | 每領域並行 |
| Verify | 每領域一支對抗式驗證官：**實跑 node/python 核對每題答案**、強化「答錯詳解」 | 每領域並行 |
| Assemble | 寫 `03-模擬題庫與解析.md` 與 `_questions.json` | 1 |
| Website | 以 `its-python-cert/index.html` 為藍本，換領域與題庫，產 `index.html`＋`server.js` | 2 |
| Report | 回報產出檔案與題數 | — |

## 兩種用法

### A. 新證照（完整流程：Research → … → Website）
### B. 擴充既有證照題庫（expand 模式：Load → Generate → Verify → Rebuild）
只補題、實跑驗證後併回既有網站，不重跑調研。例：
```
args: { "mode": "expand", "slug": "javascript", "perDomain": 20 }
```
它會：讀 `<slug>/index.html` 現有題庫 → 各領域補到 `perDomain` 題（避免與現有重複）→ 用 Node/Python 實跑驗證 → 更新 `index.html` 的 Q 陣列、題數文案、MOCK_PLAN，並產出擴充題庫 md。

## 怎麼跑（新證照）

用 Claude 對它下指令即可（它會呼叫 Workflow 工具）。三種傳參：

- 只給主題字串：
  `args: "ITS HTML and CSS"`
- 指定資料夾與每領域題數：
  `args: { "topic": "ITS HTML and CSS", "slug": "its-html-css-cert", "perDomain": 28 }`
- 指定驗證語言（預設由主題推斷 python/javascript/java）：
  `args: { "topic": "ITS Java", "lang": "java" }`

呼叫方式（擇一）：
- 具名：Workflow `name: "its-cert-kit"`，`args: {...}`
- 直接指定腳本：Workflow `scriptPath: ".../.claude/workflows/its-cert-kit.js"`，`args: {...}`

## 參數

| 參數 | 說明 | 預設 |
|------|------|------|
| `topic` | 證照主題（如 "ITS HTML and CSS"） | "ITS Python" |
| `slug` | 輸出資料夾名 | 由 topic 推導 `its-<...>-cert` |
| `lang` | 驗證答案用的執行語言 | 由 topic 推斷 |
| `perDomain` | 每個領域出題數 | 28 |

## 產出（寫到 `educational/<slug>/`）
`01-知識範圍與考綱.md`、`02-題庫與資源彙整.md`、`03-模擬題庫與解析.md`、`_questions.json`、`index.html`、`server.js`

## 注意
- Verify 階段會實跑程式碼核對答案；DOM/表單等不可執行題依官方語法/MDN 核對。
- 產出後**建議人工抽查** `index.html` 與 `03` 題庫再對外分享。
- 會花較多 token（數十個子代理）。要控制規模可調小 `perDomain`。
