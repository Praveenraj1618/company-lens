import sourceCatalog from './source-catalog.json' with { type: 'json' };
import type { Company, Region, Source } from './types.ts';

export const CATALOG_VERSION = '2026-09-regional-v3';
export const COLLECTION_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const LANGUAGES = { en: 'English', ta: 'Tamil', hi: 'Hindi', kn: 'Kannada', te: 'Telugu', ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati', mr: 'Marathi', pa: 'Punjabi', or: 'Odia', as: 'Assamese', ur: 'Urdu' } as const;
export const REGIONS = ['India', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Andhra Pradesh', 'Telangana', 'Puducherry', 'Delhi', 'Haryana', 'Punjab', 'Chandigarh', 'Himachal Pradesh', 'Jammu and Kashmir', 'Ladakh', 'Uttar Pradesh', 'Uttarakhand', 'Rajasthan', 'Gujarat', 'Maharashtra', 'Goa', 'Madhya Pradesh', 'Chhattisgarh', 'Bihar', 'Jharkhand', 'Odisha', 'West Bengal', 'Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura', 'North East', 'Andaman and Nicobar Islands', 'Lakshadweep', 'Dadra and Nagar Haveli and Daman and Diu', 'Global'] as const;
export type Zone = 'National' | 'North' | 'South' | 'East' | 'West' | 'Central' | 'North East' | 'Global';
const zoneRegions: Record<Exclude<Zone, 'National' | 'Global'>, readonly string[]> = {
  North: ['Delhi', 'Haryana', 'Punjab', 'Chandigarh', 'Himachal Pradesh', 'Jammu and Kashmir', 'Ladakh', 'Uttar Pradesh', 'Uttarakhand', 'Rajasthan'],
  South: ['Tamil Nadu', 'Karnataka', 'Kerala', 'Andhra Pradesh', 'Telangana', 'Puducherry', 'Lakshadweep', 'Andaman and Nicobar Islands'],
  East: ['Bihar', 'Jharkhand', 'Odisha', 'West Bengal'],
  West: ['Gujarat', 'Maharashtra', 'Goa', 'Dadra and Nagar Haveli and Daman and Diu'],
  Central: ['Madhya Pradesh', 'Chhattisgarh'],
  'North East': ['North East', 'Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'],
};
export function sourceZone(region: string): Zone {
  if (region === 'Global') return 'Global';
  return (Object.entries(zoneRegions).find(([, regions]) => regions.includes(region))?.[0] as Zone) || 'National';
}
export const catalogEntries = sourceCatalog;
export const initialSources: Source[] = sourceCatalog.map(s => ({ id: s.id, name: s.name, url: s.url, region: s.region as Region, language: s.language, kind: 'rss', enabled: true, status: 'unfetched', lastFetchedAt: null, error: null }));
export function sourcePublisher(source: Pick<Source, 'id' | 'url'>): string {
  return sourceCatalog.find(s => s.id === source.id)?.publisher || new URL(source.url).hostname.replace(/^www\./, '');
}
const createdAt = '2026-09-01T09:00:00.000Z';
const companies: [string, string, string, string, string[]][] = [
  ['infosys', 'Infosys', 'infosys.com', 'Technology', ['Infosys Limited', 'இன்ஃபோசிஸ்', 'இன்போசிஸ்', 'इन्फोसिस']],
  ['tcs', 'Tata Consultancy Services', 'tcs.com', 'Technology', ['TCS', 'டிசிஎஸ்', 'டாடா கன்சல்டன்சி', 'टीसीएस']],
  ['wipro', 'Wipro', 'wipro.com', 'Technology', ['Wipro Limited', 'விப்ரோ', 'विप्रो']],
  ['zoho', 'Zoho', 'zoho.com', 'Software', ['Zoho Corporation', 'ஜோஹோ', 'சோஹோ']],
  ['hcltech', 'HCLTech', 'hcltech.com', 'Technology', ['HCL Technologies', 'HCL Tech', 'எச்சிஎல்']],
  ['vee-technologies', 'Vee Technologies', 'veetechnologies.com', 'Technology & business services', ['Vee Technologies Pvt Ltd', 'Vee Technologies Private Limited', 'Vee Technologies Inc', 'வீ டெக்னாலஜிஸ்', 'வீ டெக்னாலஜீஸ்', 'ವೀ ಟೆಕ್ನಾಲಜೀಸ್', 'വീ ടെക്നോളജീസ്', 'వీ టెక్నాలజీస్']],
  ['freshworks', 'Freshworks', 'freshworks.com', 'Software', ['Freshworks Inc', 'பிரெஷ்வொர்க்ஸ்']],
  ['cognizant', 'Cognizant', 'cognizant.com', 'Technology', ['Cognizant Technology Solutions', 'காக்னிசன்ட்']],
  ['accenture', 'Accenture', 'accenture.com', 'Technology & consulting', ['Accenture plc', 'அக்சென்சர்']],
  ['tech-mahindra', 'Tech Mahindra', 'techmahindra.com', 'Technology', ['Tech Mahindra Limited', 'டெக் மஹிந்திரா', 'टेक महिंद्रा']],
  ['ltimindtree', 'LTIMindtree', 'ltimindtree.com', 'Technology', ['LTI Mindtree', 'LTIMindtree Limited']],
  ['mphasis', 'Mphasis', 'mphasis.com', 'Technology', ['Mphasis Limited']],
  ['persistent', 'Persistent Systems', 'persistent.com', 'Technology', ['Persistent Systems Limited']],
  ['tata-elxsi', 'Tata Elxsi', 'tataelxsi.com', 'Design & engineering', ['Tata Elxsi Limited', 'டாடா எல்க்ஸி']],
  ['tvs-motor', 'TVS Motor', 'tvsmotor.com', 'Automotive', ['TVS Motor Company', 'டிவிஎஸ் மோட்டார்', 'टीवीएस मोटर']],
  ['ashok-leyland', 'Ashok Leyland', 'ashokleyland.com', 'Automotive', ['Ashok Leyland Limited', 'அசோக் லேலண்ட்', 'अशोक लेलैंड']],
  ['reliance', 'Reliance Industries', 'ril.com', 'Diversified industries', ['Reliance Industries Limited', 'ரிலையன்ஸ் இண்டஸ்ட்ரீஸ்', 'रिलायंस इंडस्ट्रीज']],
  ['tata-motors', 'Tata Motors', 'tatamotors.com', 'Automotive', ['Tata Motors Limited', 'டாடா மோட்டார்ஸ்', 'टाटा मोटर्स']],
  ['mahindra', 'Mahindra & Mahindra', 'mahindra.com', 'Automotive & equipment', ['Mahindra and Mahindra', 'Mahindra & Mahindra Limited', 'மஹிந்திரா அண்ட் மஹிந்திரா']],
  ['adani-enterprises', 'Adani Enterprises', 'adanienterprises.com', 'Diversified industries', ['Adani Enterprises Limited', 'அதானி என்டர்பிரைசஸ்', 'अदानी एंटरप्राइजेज']],
];
export const initialCompanies: Company[] = companies.map(([id, name, domain, industry, aliases]) => ({ id, name, domain, industry, aliases, description: `Track coverage of ${name} across monitored sources.`, demo: false, createdAt }));
