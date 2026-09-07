# Evaluation and current evidence

The checked-in fixture has **8 fictional articles, 7 story groups, and 18 questions**. Fifteen questions are answerable and three have no supporting document. Two questions are in Tamil. Labels were authored for this fixture and have not been independently reviewed.

## Reproduced lexical retrieval results

| Configuration | Recall@5 | MRR | Abstention on 3 unsupported queries |
|---|---:|---:|---:|
| original_text | 0.933 | 0.933 | 1.000 |
| with_demo_translation | 1.000 | 1.000 | 1.000 |

`with_demo_translation` includes a prewritten English translation of the Tamil demonstration article. It does **not** measure automatic translation quality. The original-text configuration misses the English water-use query, which illustrates a cross-language retrieval gap.

These are smoke-test numbers on a tiny, deliberately straightforward fixture. Do not claim them as real-world retrieval accuracy, a model benchmark, or a resume improvement over a dense baseline. No dense baseline has been measured here. Per-question rankings and local retrieval timing are in `evaluation/latest.json`.

## What is tested

- Unicode company matching and acronym boundaries.
- RSS/Atom parsing, unsafe XML, HTML extraction, publication dates and robots rules.
- URL tracking cleanup, private-host rejection, redirect validation and response limits.
- Conservative tone labels, negation, exact evidence quotes and invalid model output.
- Lexical ranking, rank fusion, vector shape checks, clustering and absent-evidence responses.
- Durable database writes, company isolation, repeated collection, run logs and authentication.
- Production Worker rendering, static assets, standalone HTTP and persistence across reopen.
- Catalog upgrades preserving edits, three-hour due selection, full scheduled cycles and per-host concurrency.
- Encryption round trips, tamper/wrong-key rejection, resumable snapshot imports, source switches and company isolation.
- Public publisher IP ranges accepted without permitting private or reserved networks.

## Live collection verification

The first GitHub collection ran successfully on 7 September 2026. It checked all 115 feeds, produced encrypted results, and published its manifest. The encrypted payload was independently decrypted and imported through the same private sync code, producing 10 real company/article records and 115 source run records. That run found 67 readable feeds and 48 errors. It exposed an overly broad public-IP rejection, which was corrected with regression tests. Several unavailable catalog candidates were replaced with directly verified regional feeds, including Kannada, Malayalam, Telugu, Tamil and Hindi alternatives.

Those numbers describe the first run, not a permanent source-availability guarantee or a claim that all 115 feeds always work. The dashboard records actual results for each subsequent run. Sources blocked by robots or access policy remain blocked; no bypass is attempted.

## What remains unverified

Real model/embedding requests were not run because no API key was configured. Browser interaction and visual QA were not run. The Docker recipe was not built here. Live translation and contextual analysis across the added languages are not benchmarked.

## A portfolio benchmark to build next

1. Collect a permitted corpus from 5 companies and 8–12 sources across two languages. Preserve timestamps and the text actually available to the system.
2. Create at least 100 held-out questions, including cross-language queries, common-name distractors, repeated stories, claims with contradictory reporting and unanswerable questions.
3. Have another reviewer check source relevance, company identity, event labels and whether every answer claim is supported.
4. Compare BM25, embeddings, hybrid fusion and an optional reranker on the identical corpus and held-out questions. Tune thresholds on a separate development split.
5. Report Recall@5, MRR, false company matches, duplicate-group precision/recall, citation correctness, answer entailment, appropriate abstention, p50/p95 latency and actual provider cost.
6. Publish the failure cases and explain dataset licensing and access limitations. Keep collected third-party full text and secrets out of a public repository unless you have redistribution rights.

The evaluation scripts and fixtures are scaffolding for that measurement work; they are not a substitute for it.
