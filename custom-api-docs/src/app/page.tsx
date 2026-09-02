import { Sidebar } from "@/components/layout/Sidebar";
import { SearchRequestBuilder } from "@/components/api-reference/SearchRequestBuilder";
import { GenericEndpointBuilder } from "@/components/api-reference/GenericEndpointBuilder";
import { CollapsibleSection } from "@/components/api-reference/CollapsibleSection";
import { getOpenApiSpec } from "@/lib/openapi";
import { Badge } from "@/components/ui/badge";
import { Country } from "country-state-city";
import { RobotAssistant } from "@/components/layout/RobotAssistant";

import { Download } from "lucide-react";

export default function ApiReferencePage() {
  const spec = getOpenApiSpec();

  const countryOptions = Country.getAllCountries().map(c => ({
    label: c.name,
    value: c.isoCode
  }));

  const sidebarItems = [
    {
      title: "Overview",
      items: [
        { title: "Introduction", href: "#introduction" },
        { title: "Authentication", href: "#authentication" },
      ]
    },
    {
      title: "Search API",
      items: [
        { title: "POST /search people", href: "#search-people" },
        { title: "POST /search company", href: "#search-company" },
      ]
    },
    {
      title: "Enrichment API",
      items: [
        { title: "GET /contact and full info", href: "#contact" },
        { title: "GET /full-info (without contact)", href: "#full-info" },
      ]
    },
    {
      title: "Account",
      items: [
        { title: "GET /credits", href: "#credits" },
      ]
    }
  ];

  return (
    <div className="container max-w-screen-2xl items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 relative">
      <aside className="fixed top-14 z-30 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 md:sticky md:block overflow-y-auto py-6 pr-6 pl-4">
        <Sidebar items={sidebarItems} />
      </aside>
      
      <main className="relative py-6 lg:gap-10 lg:py-8 xl:grid">
        <div className="mx-auto w-full min-w-0">
          <div className="mb-10 space-y-4">
            <h1 className="text-4xl font-bold tracking-tight">API Reference</h1>
            <p className="text-lg text-muted-foreground">
              {spec.info.description.split('\n')[0]}
            </p>
          </div>

          {/* Introduction Section */}
          <div id="introduction" className="scroll-mt-20 mb-16">
            <h2 className="text-3xl font-semibold tracking-tight mb-4">Introduction</h2>
            <div className="text-lg text-muted-foreground mb-8 space-y-4">
              <p>
                The Mawsool API is a robust, developer-first infrastructure solution. Engineered for scale and reliability, our platform provides high-throughput endpoints for deep B2B enrichment and targeted, granular searching.
              </p>
              <p>
                Our engine is backed by proprietary USPTO patented technology, utilizing an advanced deep-tech architecture and a fully integrated, live ecosystem that features real-time search and verification capabilities. By exposing this intelligence layer directly to your systems, you can build seamless data pipelines, automate lead workflows, and embed a cost-efficient data infrastructure directly into your software stack.
              </p>
            </div>
            
            <div className="prose dark:prose-invert max-w-none">
              <h3 className="text-2xl font-semibold mb-6">Core Capabilities</h3>
              
              <div className="mb-8">
                <h4 className="text-xl font-semibold mb-2">1. Unified Search API</h4>
                <p className="mb-2"><strong>Overview:</strong> Programmatically discover target accounts and decision-makers at scale.</p>
                <p className="mb-2"><strong>Functionality:</strong> Query our massive database of company and professional profiles using advanced, highly precise filtering criteria. We offer two dedicated search endpoints:</p>
                <ul className="mt-2 mb-4">
                  <li><strong>Search People:</strong> Find specific decision-makers and professionals.</li>
                  <li><strong>Search Company:</strong> Discover target accounts and organizations.</li>
                </ul>
                <p>Every query leverages our real-time search capabilities to pull active, up-to-the-minute records directly from our dynamic ecosystem rather than relying on stagnant storage.</p>
              </div>

              <div className="mb-8">
                <h4 className="text-xl font-semibold mb-2">2. Enrichment API</h4>
                <p className="mb-2"><strong>Overview:</strong> Instantly transform fragmented touchpoints into complete, actionable profiles rich with verified contacts (phone numbers and emails).</p>
                <p><strong>Functionality:</strong> Input a standard LinkedIn URL to receive a structured, fully populated payload. Powered by patented data-gathering methods and real-time verification capabilities, the API extracts instant, live-checked intelligence from our ecosystem to deliver verified email addresses, accurate direct phone numbers, updated employment history, and company firmographics.</p>
              </div>
            </div>
          </div>

          <div className="h-20"></div>

          {/* Authentication Section */}
          <div id="authentication" className="scroll-mt-20 mb-16">
            <h2 className="text-3xl font-semibold tracking-tight mb-4">Authentication</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Learn how to authenticate your API requests.
            </p>
            <div className="prose dark:prose-invert max-w-none">
              <p>To use this API, you will need a valid <code>X-API-Key</code>.</p>
              <p>Include the API key in the header of all your requests:</p>
              <pre className="bg-muted p-4 rounded-md">
                <code>X-API-Key: your_api_key_here</code>
              </pre>
            </div>
          </div>

          <div className="h-20"></div>

          {/* Search People Endpoint Section */}
          <CollapsibleSection
            id="search-people"
            method="POST"
            title="/search people"
            description="Perform targeted searches for B2B profiles with advanced filtering."
            badgeClass="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
            defaultOpen={true}
          >
            <div className="flex items-center gap-2 mb-8">
              <a 
                href="/mawsool_api_allowed_filters.xlsx" 
                download 
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Allowed Filter Values (Excel)
              </a>
            </div>
            
            <SearchRequestBuilder fixedType="people" />
          </CollapsibleSection>

          <div className="h-16"></div>

          {/* Search Company Endpoint Section */}
          <CollapsibleSection
            id="search-company"
            method="POST"
            title="/search company"
            description="Perform targeted searches for companies with advanced filtering."
            badgeClass="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
            defaultOpen={false}
          >
            <div className="flex items-center gap-2 mb-8">
              <a 
                href="/mawsool_api_allowed_filters.xlsx" 
                download 
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Allowed Filter Values (Excel)
              </a>
            </div>
            
            <SearchRequestBuilder fixedType="companies" />
          </CollapsibleSection>

          <div className="h-16"></div>

          {/* Contact Endpoint Section */}
          <CollapsibleSection
            id="contact"
            method="GET"
            title="/contact and full info"
            description="Enrich a LinkedIn Profile with Comprehensive Data. Retrieves comprehensive contact and company information for a given LinkedIn profile URL."
            badgeClass="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            defaultOpen={false}
          >
            <GenericEndpointBuilder 
              method="GET" 
              path="/contact" 
              queryParams={[
                { name: "url", required: true, description: "The full LinkedIn profile URL to enrich.", placeholder: "https://www.linkedin.com/in/..." },
                { 
                  name: "fields", 
                  required: true, 
                  description: "Fields to retrieve.", 
                  placeholder: "Select fields...",
                  options: [
                    { label: "email", value: "email" },
                    { label: "phone", value: "phone" },
                    { label: "email,phone", value: "email,phone" }
                  ]
                },
                { 
                  name: "country", 
                  required: false, 
                  description: "Optional: Our API makes the enriched profile's country a priority automatically. You can specify a 2-letter ISO country code here if needed.", 
                  placeholder: "Select country...",
                  options: countryOptions
                },
              ]}
            />
          </CollapsibleSection>

          <div className="h-16"></div>

          {/* Full-Info Endpoint Section */}
          <CollapsibleSection
            id="full-info"
            method="GET"
            title="/full-info (without contact)"
            description="Enrich a LinkedIn Profile (Extended Details without contact info)."
            badgeClass="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            defaultOpen={false}
          >
            <GenericEndpointBuilder 
              method="GET" 
              path="/full-info" 
              queryParams={[
                { name: "url", required: true, description: "The full LinkedIn profile URL to enrich.", placeholder: "https://www.linkedin.com/in/..." }
              ]}
            />
          </CollapsibleSection>

          <div className="h-16"></div>

          {/* Credits Endpoint Section */}
          <CollapsibleSection
            id="credits"
            method="GET"
            title="/credits"
            description="Check Remaining Credits. Returns the number of API credits currently remaining on your account."
            badgeClass="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            defaultOpen={false}
          >
            <div className="mb-10 mt-2">
              <div className="rounded-lg border bg-card p-6 shadow-sm">
                <h3 className="text-xl font-semibold mb-3">Credit Consumption Model</h3>
                <p className="text-muted-foreground mb-6 text-sm">
                  Mawsool operates on a pay-for-results credit model. Credits are deducted dynamically based on the type of API request and the specific data points successfully retrieved.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-md">API Action</th>
                        <th className="px-4 py-3">Data Point</th>
                        <th className="px-4 py-3 rounded-tr-md">Credit Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-4 py-4 font-medium">Search API (People / Company)</td>
                        <td className="px-4 py-4 text-muted-foreground">Per Search Result returned</td>
                        <td className="px-4 py-4"><Badge variant="outline" className="bg-background">1 Credit</Badge></td>
                      </tr>
                      <tr>
                        <td className="px-4 py-4 font-medium">Enrichment API</td>
                        <td className="px-4 py-4 text-muted-foreground">Per Email successfully revealed</td>
                        <td className="px-4 py-4"><Badge variant="outline" className="bg-background">5 Credits</Badge></td>
                      </tr>
                      <tr>
                        <td className="px-4 py-4 font-medium">Enrichment API</td>
                        <td className="px-4 py-4 text-muted-foreground">Per Phone Number successfully revealed</td>
                        <td className="px-4 py-4"><Badge variant="outline" className="bg-background">20 Credits</Badge></td>
                      </tr>
                      <tr>
                        <td className="px-4 py-4 font-medium">Full Info API (Without Contact)</td>
                        <td className="px-4 py-4">
                          <span className="text-muted-foreground block mb-1">Per LinkedIn URL Profile retrieved</span>
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Free when requested alongside Contact Enrichment (/contact and full info).</span>
                        </td>
                        <td className="px-4 py-4"><Badge variant="outline" className="bg-background">1 Credit</Badge></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <GenericEndpointBuilder 
              method="GET" 
              path="/credits" 
              queryParams={[]}
            />
          </CollapsibleSection>

          <div className="h-40"></div>
          
          <RobotAssistant />
        </div>
      </main>
    </div>
  );
}
