# Regional source catalog

The default catalog contains **139 Indian sources and 22 global sources**, from **82 named publications or editorial products**. There are **141 configured RSS/Atom endpoints** and **20 feed-discovery entries**. Multiple regional editions from the same publisher are separate feeds, not independent confirmations. It covers all six broad Indian regions, with regional languages including Tamil, Hindi, Kannada, Telugu, Malayalam, Bengali and Gujarati, alongside English. It does not guarantee coverage of every state, organization or article.

The machine-readable catalog is `lib/source-catalog.json`. Each entry has a stable ID, URL, geographic coverage, language, publisher and reference URL. An optional `kind` distinguishes RSS endpoints from publisher pages used only for feed discovery. Geography describes the feed's coverage, not a verified location of every event. The runtime source status starts at **Not checked** and changes only after an actual collection attempt. A listed RSS endpoint can still be unavailable, stale, empty, paywalled or restricted from a particular network. Failed sources remain visible with their reason; an empty feed is not evidence of no company activity.

Feed URLs were cross-checked against publisher directories or direct RSS responses. The directories include [Times of India](https://timesofindia.indiatimes.com/rss.cms), [The Indian Express](https://indianexpress.com/rss/), [Hindustan Times](https://www.hindustantimes.com/rss), [Business Standard](https://www.business-standard.com/rss-feeds/listing), [Oneindia Tamil](https://tamil.oneindia.com/rss/), [Oneindia Hindi](https://hindi.oneindia.com/rss/), [Oneindia Kannada](https://kannada.oneindia.com/rss/), [Oneindia Telugu](https://telugu.oneindia.com/rss/), and [Guardian feed guidance](https://www.theguardian.com/help/feeds). Alternative regional feeds include Asianet News in Kannada, Malayalam, Telugu, Hindi and Tamil, plus [Live Hindustan](https://www.livehindustan.com/rss) Hindi feeds and Nagaland Post. Individual regional publications and global feed endpoints are recorded in each entry's reference field. A reference equal to the feed URL identifies a candidate endpoint, not a successful availability check.

This is a private, personal research workspace. Keep attribution and links to original reporting. The collector respects robots rules and access failures, reads bounded publisher-supplied excerpts, and does not unlock subscription content. The scheduled collector encrypts collected text before it is stored in GitHub. Do not publish or commercially redistribute publisher content without the relevant permission.

## Companies

Twenty real companies are seeded: Infosys, TCS, Wipro, Zoho, HCLTech, **Vee Technologies**, Freshworks, Cognizant, Accenture, Tech Mahindra, LTIMindtree, Mphasis, Persistent Systems, Tata Elxsi, TVS Motor, Ashok Leyland, Reliance Industries, Tata Motors, Mahindra & Mahindra and Adani Enterprises. The Aster Mobility sample remains explicitly fictional and separate.

Company names and curated aliases control matching. Short ambiguous strings such as `Vee`, `RIL` or `Persistent` alone are deliberately absent. Regional script detection is heuristic; translations and semantic analysis require the server AI key. Names may still need additional local-language aliases, and a mention is not proof that an article's overall sentiment applies to the company.

Catalog upgrades use versioned, idempotent inserts. They preserve existing company edits, user-added records, source switches and collected articles. Limits allow up to 75 companies and 250 sources.

## Requested technology expansion

All sites from the supplied list are represented. TechCrunch, The Verge, Ars Technica and Inc42 were already present; the following 46 entries were added. RSS configuration does not guarantee live availability. Discovery checks at most three publisher-advertised RSS/Atom links and respects robots rules for each; it never ingests an entire homepage as a company event. If no feed is advertised, use the article/excerpt import. Dailyhunt, Way2News and Lokal currently have no configured app/API integration.

| Publication | Collection method | Reference |
|---|---|---|
| Wired | RSS / Atom endpoint | [Publisher](https://www.wired.com/) |
| CNET | Discover advertised feed; manual import if unavailable | [Publisher](https://www.cnet.com/) |
| Engadget | RSS / Atom endpoint | [Publisher](https://www.engadget.com/) |
| ZDNET | Discover advertised feed; manual import if unavailable | [Publisher](https://www.zdnet.com/) |
| TechRadar | RSS / Atom endpoint | [Publisher](https://www.techradar.com/) |
| Gizmodo | Discover advertised feed; manual import if unavailable | [Publisher](https://gizmodo.com/) |
| Mashable | Discover advertised feed; manual import if unavailable | [Publisher](https://mashable.com/) |
| Gadgets 360 | RSS / Atom endpoint | [Publisher](https://www.gadgets360.com/rss) |
| Beebom | RSS / Atom endpoint | [Publisher](https://beebom.com/) |
| 91mobiles | Discover advertised feed; manual import if unavailable | [Publisher](https://www.91mobiles.com/hub/) |
| MySmartPrice | RSS / Atom endpoint | [Publisher](https://www.mysmartprice.com/gear/) |
| Smartprix | Discover advertised feed; manual import if unavailable | [Publisher](https://www.smartprix.com/bytes/) |
| Gadgets Now | RSS / Atom endpoint | [Publisher](https://www.gadgetsnow.com/) |
| Gizbot | RSS / Atom endpoint | [Publisher](https://www.gizbot.com/rss/) |
| FoneArena | RSS / Atom endpoint | [Publisher](https://www.fonearena.com/blog/) |
| ET CIO | RSS / Atom endpoint | [Publisher](https://cio.economictimes.indiatimes.com/) |
| TechCircle | Discover advertised feed; manual import if unavailable | [Publisher](https://www.techcircle.in/) |
| Express Computer | RSS / Atom endpoint | [Publisher](https://www.expresscomputer.in/) |
| Enterprise IT World | Discover advertised feed; manual import if unavailable | [Publisher](https://www.enterpriseitworld.com/) |
| TechDay India | RSS / Atom endpoint | [Publisher](https://techday.in/) |
| ITVarnews / TechPlus Media | RSS / Atom endpoint | [Publisher](https://itvarnews.techplusmedia.com/) |
| Tech Observer | RSS / Atom endpoint | [Publisher](https://techobserver.in/) |
| ET Tech | RSS / Atom endpoint | [Publisher](https://economictimes.indiatimes.com/tech) |
| LiveMint Tech | RSS / Atom endpoint | [Publisher](https://www.livemint.com/technology) |
| Trak.in | RSS / Atom endpoint | [Publisher](https://trak.in/) |
| SiliconIndia | Discover advertised feed; manual import if unavailable | [Publisher](https://www.siliconindia.com/) |
| TelecomTalk | RSS / Atom endpoint | [Publisher](https://telecomtalk.info/) |
| The Hacker News | RSS / Atom endpoint | [Publisher](https://thehackernews.com/) |
| Labnol / Digital Inspiration | RSS / Atom endpoint | [Publisher](https://www.labnol.org/) |
| Techwiser | RSS / Atom endpoint | [Publisher](https://techwiser.com/) |
| Windows Latest | RSS / Atom endpoint | [Publisher](https://www.windowslatest.com/) |
| VCCircle | Discover advertised feed; manual import if unavailable | [Publisher](https://www.vccircle.com/) |
| The New Indian Express · Technology | Discover advertised feed; manual import if unavailable | [Publisher](https://www.newindianexpress.com/lifestyle/tech) |
| YourStory | Discover advertised feed; manual import if unavailable | [Publisher](https://yourstory.com/) |
| Analytics India Magazine | Discover advertised feed; manual import if unavailable | [Publisher](https://analyticsindiamag.com/) |
| Gadgets 360 Hindi | RSS / Atom endpoint | [Publisher](https://hindi.gadgets360.com/) |
| Maalai Malar · Technology | Discover advertised feed; manual import if unavailable | [Publisher](https://www.maalaimalar.com/technology) |
| Ei Samay · Technology | Discover advertised feed; manual import if unavailable | [Publisher](https://eisamay.com/tech) |
| Dailyhunt | Discover advertised feed; manual import if unavailable | [Publisher](https://dailyhunt.in/) |
| Way2News | Discover advertised feed; manual import if unavailable | [Publisher](https://way2news.co/) |
| Lokal | Discover advertised feed; manual import if unavailable | [Publisher](https://getlokalapp.com/) |
| Gizbot Tamil | RSS / Atom endpoint | [Publisher](https://tamil.gizbot.com/rss/) |
| Gizbot Telugu | RSS / Atom endpoint | [Publisher](https://telugu.gizbot.com/rss/) |
| Gizbot Kannada | Discover advertised feed; manual import if unavailable | [Publisher](https://kannada.gizbot.com/rss/) |
| Gizbot Malayalam | RSS / Atom endpoint | [Publisher](https://malayalam.gizbot.com/rss/) |
| Gizbot Bengali | Discover advertised feed; manual import if unavailable | [Publisher](https://bengali.gizbot.com/rss/) |

Official directories checked include [Gadgets 360](https://www.gadgets360.com/rss), [Gizbot](https://www.gizbot.com/rss/), [Tamil Gizbot](https://tamil.gizbot.com/rss/), [Telugu Gizbot](https://telugu.gizbot.com/rss/), and [Malayalam Gizbot](https://malayalam.gizbot.com/rss/). Gadgets 360 specifies attribution and personal, non-commercial use of its feeds; this workspace retains source names and original links.
