import { Building2, Radar, Rss, ScanSearch } from "lucide-react";
export default function Home() {
  return <main className="foundation">
    <div className="brand"><Radar size={30} /> Company Lens</div>
    <p className="eyebrow">COMPANY INTELLIGENCE</p>
    <h1>Every story. A clearer picture.</h1>
    <p>Follow the developments that matter, from regional reporting to global coverage.</p>
    <div className="foundation-grid">
      <section><Building2 /><h2>Your watchlist</h2><p>Track companies and their regional name variants.</p></section>
      <section><Rss /><h2>Source coverage</h2><p>Collect news from RSS feeds and public articles.</p></section>
      <section><ScanSearch /><h2>Evidence first</h2><p>Connect every finding to its supporting passage.</p></section>
    </div>
  </main>;
}
