# Regional source catalog

The default catalog contains **100 Indian RSS/Atom feeds and 15 global feeds**, from **42 named publications or editorial products**. Multiple regional editions from the same publisher are separate feeds, not independent confirmations. It covers all six broad Indian regions, with regional languages including Tamil, Hindi, Kannada, Telugu, Malayalam, Bengali and Gujarati, alongside English. It does not guarantee coverage of every state, organization or article.

The machine-readable catalog is `lib/source-catalog.json`. Each entry has a stable ID, URL, geographic coverage, language, publisher and reference URL. Geography describes the feed's coverage, not a verified location of every event. The runtime source status starts at **Not checked** and changes only after an actual collection attempt. A listed RSS endpoint can still be unavailable, stale, empty, paywalled or restricted from a particular network. Failed sources remain visible with their reason; an empty feed is not evidence of no company activity.

Feed URLs were cross-checked against publisher directories or direct RSS responses. The directories include [Times of India](https://timesofindia.indiatimes.com/rss.cms), [The Indian Express](https://indianexpress.com/rss/), [Hindustan Times](https://www.hindustantimes.com/rss), [Business Standard](https://www.business-standard.com/rss-feeds/listing), [Oneindia Tamil](https://tamil.oneindia.com/rss/), [Oneindia Hindi](https://hindi.oneindia.com/rss/), [Oneindia Kannada](https://kannada.oneindia.com/rss/), [Oneindia Telugu](https://telugu.oneindia.com/rss/), and [Guardian feed guidance](https://www.theguardian.com/help/feeds). Individual regional publications and global feed endpoints are recorded in each entry's reference field. A reference equal to the feed URL identifies a candidate endpoint, not a successful availability check.

This is a private, personal research workspace. Keep attribution and links to original reporting. The collector respects robots rules and access failures, reads bounded publisher-supplied excerpts, and does not unlock subscription content. The scheduled collector encrypts collected text before it is stored in GitHub. Do not publish or commercially redistribute publisher content without the relevant permission.

## Companies

Twenty real companies are seeded: Infosys, TCS, Wipro, Zoho, HCLTech, **Vee Technologies**, Freshworks, Cognizant, Accenture, Tech Mahindra, LTIMindtree, Mphasis, Persistent Systems, Tata Elxsi, TVS Motor, Ashok Leyland, Reliance Industries, Tata Motors, Mahindra & Mahindra and Adani Enterprises. The Aster Mobility sample remains explicitly fictional and separate.

Company names and curated aliases control matching. Short ambiguous strings such as `Vee`, `RIL` or `Persistent` alone are deliberately absent. Regional script detection is heuristic; translations and semantic analysis require the server AI key. Names may still need additional local-language aliases, and a mention is not proof that an article's overall sentiment applies to the company.

Catalog upgrades use versioned, idempotent inserts. They preserve existing company edits, user-added records, source switches and collected articles. Limits allow up to 75 companies and 250 sources.
