"use client";

import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CodeSample } from "./CodeSample";
import { ApiTester } from "./ApiTester";
import { Card, CardContent } from "@/components/ui/card";
import parsedFilters from "@/data/parsedFilters.json";
import industryGroups from "@/data/industryGroups.json";
import { jobTitles } from "@/data/jobTitles";

interface FilterObject {
  include: { value: string }[];
  exclude: { value: string }[];
}

interface SearchFormValues {
  type?: "people" | "companies";
  page?: number;
  limit?: number;
  filters: {
    location: FilterObject;
    city: FilterObject;
    job_title: FilterObject;
    function: FilterObject;
    past_role: FilterObject;
    past_company: FilterObject;
    company_headcount: FilterObject;
    industry: FilterObject;
    first_name: FilterObject;
    last_name: FilterObject;
    company_name: FilterObject;
      company_location: FilterObject;
      seniority: FilterObject;
      years_in_current_role: FilterObject;
      experience: FilterObject;
      behavioral_keywords: FilterObject;
      language: FilterObject;
    education: FilterObject;
    revenue: FilterObject;
    founded_year: FilterObject;
    expand_job_titles?: boolean;
  };
}

const emptyFilterObj = { include: [], exclude: [] };

// Helper to map country names to ISO codes for the API payload
const mapCountryToIso = (countryName: string): string => {
  const mapping: Record<string, string> = {
    'united states': 'US', 'usa': 'US', 'united states of america': 'US', 'us': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'gb': 'GB',
    'canada': 'CA', 'ca': 'CA',
    'australia': 'AU', 'au': 'AU',
    'germany': 'DE', 'de': 'DE',
    'france': 'FR', 'fr': 'FR',
    'jordan': 'JO', 'jo': 'JO',
    'united arab emirates': 'AE', 'uae': 'AE', 'ae': 'AE',
    'saudi arabia': 'SA', 'ksa': 'SA', 'sa': 'SA',
    'egypt': 'EG', 'eg': 'EG',
    'palestine': 'PS', 'ps': 'PS',
    'kuwait': 'KW', 'kw': 'KW',
    'qatar': 'QA', 'qa': 'QA',
    'bahrain': 'BH', 'bh': 'BH',
    'oman': 'OM', 'om': 'OM',
    'lebanon': 'LB', 'lb': 'LB',
    'iraq': 'IQ', 'iq': 'IQ',
    'yemen': 'YE', 'ye': 'YE',
    'syria': 'SY', 'sy': 'SY',
    'turkey': 'TR', 'tr': 'TR',
    'india': 'IN', 'in': 'IN',
    'china': 'CN', 'cn': 'CN',
    'japan': 'JP', 'jp': 'JP',
    'south korea': 'KR', 'kr': 'KR',
    'brazil': 'BR', 'br': 'BR',
    'mexico': 'MX', 'mx': 'MX',
    'russia': 'RU', 'ru': 'RU',
    'italy': 'IT', 'it': 'IT',
    'spain': 'ES', 'es': 'ES',
    'netherlands': 'NL', 'nl': 'NL',
    'switzerland': 'CH', 'ch': 'CH',
    'sweden': 'SE', 'se': 'SE',
    'norway': 'NO', 'no': 'NO',
    'denmark': 'DK', 'dk': 'DK',
    'finland': 'FI', 'fi': 'FI',
    'belgium': 'BE', 'be': 'BE',
    'austria': 'AT', 'at': 'AT',
    'poland': 'PL', 'pl': 'PL',
    'ireland': 'IE', 'ie': 'IE',
    'singapore': 'SG', 'sg': 'SG',
    'malaysia': 'MY', 'my': 'MY',
    'indonesia': 'ID', 'id': 'ID',
    'philippines': 'PH', 'ph': 'PH',
    'thailand': 'TH', 'th': 'TH',
    'vietnam': 'VN', 'vn': 'VN',
    'pakistan': 'PK', 'pk': 'PK',
    'bangladesh': 'BD', 'bd': 'BD',
    'sri lanka': 'LK', 'lk': 'LK',
    'nepal': 'NP', 'np': 'NP',
    'israel': 'IL', 'il': 'IL',
    'south africa': 'ZA', 'za': 'ZA',
    'nigeria': 'NG', 'ng': 'NG',
    'kenya': 'KE', 'ke': 'KE',
    'ghana': 'GH', 'gh': 'GH',
    'morocco': 'MA', 'ma': 'MA',
    'tunisia': 'TN', 'tn': 'TN',
    'algeria': 'DZ', 'dz': 'DZ',
    'libya': 'LY', 'ly': 'LY',
    'sudan': 'SD', 'sd': 'SD',
    'argentina': 'AR', 'ar': 'AR',
    'colombia': 'CO', 'co': 'CO',
    'chile': 'CL', 'cl': 'CL',
    'peru': 'PE', 'pe': 'PE',
    'venezuela': 'VE', 've': 'VE',
    'new zealand': 'NZ', 'nz': 'NZ',
    'portugal': 'PT', 'pt': 'PT',
    'afghanistan': 'AF', 'af': 'AF',
    'angola': 'AO', 'ao': 'AO',
    'albania': 'AL', 'al': 'AL',
    'andorra': 'AD', 'ad': 'AD',
    'armenia': 'AM', 'am': 'AM',
    'azerbaijan': 'AZ', 'az': 'AZ',
    'belarus': 'BY', 'by': 'BY',
    'bolivia': 'BO', 'bo': 'BO',
    'bosnia and herzegovina': 'BA', 'ba': 'BA',
    'botswana': 'BW', 'bw': 'BW',
    'bulgaria': 'BG', 'bg': 'BG',
    'burkina faso': 'BF', 'bf': 'BF',
    'burundi': 'BI', 'bi': 'BI',
    'cambodia': 'KH', 'kh': 'KH',
    'cameroon': 'CM', 'cm': 'CM',
    'chad': 'TD', 'td': 'TD',
    'costa rica': 'CR', 'cr': 'CR',
    'croatia': 'HR', 'hr': 'HR',
    'cuba': 'CU', 'cu': 'CU',
    'cyprus': 'CY', 'cy': 'CY',
    'czech republic': 'CZ', 'cz': 'CZ',
    'democratic republic of the congo': 'CD', 'cd': 'CD',
    'dominican republic': 'DO', 'do': 'DO',
    'ecuador': 'EC', 'ec': 'EC',
    'el salvador': 'SV', 'sv': 'SV',
    'equatorial guinea': 'GQ', 'gq': 'GQ',
    'eritrea': 'ER', 'er': 'ER',
    'estonia': 'EE', 'ee': 'EE',
    'ethiopia': 'ET', 'et': 'ET',
    'fiji': 'FJ', 'fj': 'FJ',
    'gabon': 'GA', 'ga': 'GA',
    'georgia': 'GE', 'ge': 'GE',
    'greece': 'GR', 'gr': 'GR',
    'guatemala': 'GT', 'gt': 'GT',
    'guinea': 'GN', 'gn': 'GN',
    'guyana': 'GY', 'gy': 'GY',
    'haiti': 'HT', 'ht': 'HT',
    'honduras': 'HN', 'hn': 'HN',
    'hungary': 'HU', 'hu': 'HU',
    'iceland': 'IS', 'is': 'IS',
    'iran': 'IR', 'ir': 'IR',
    'ivory coast': 'CI', 'ci': 'CI',
    'jamaica': 'JM', 'jm': 'JM',
    'kazakhstan': 'KZ', 'kz': 'KZ',
    'kyrgyzstan': 'KG', 'kg': 'KG',
    'laos': 'LA', 'la': 'LA',
    'latvia': 'LV', 'lv': 'LV',
    'lithuania': 'LT', 'lt': 'LT',
    'luxembourg': 'LU', 'lu': 'LU',
    'madagascar': 'MG', 'mg': 'MG',
    'malawi': 'MW', 'mw': 'MW',
    'mali': 'ML', 'ml': 'ML',
    'mauritania': 'MR', 'mr': 'MR',
    'mongolia': 'MN', 'mn': 'MN',
    'mozambique': 'MZ', 'mz': 'MZ',
    'myanmar': 'MM', 'mm': 'MM',
    'namibia': 'NA', 'na': 'NA',
    'nicaragua': 'NI', 'ni': 'NI',
    'niger': 'NE', 'ne': 'NE',
    'north korea': 'KP', 'kp': 'KP',
    'north macedonia': 'MK', 'mk': 'MK',
    'panama': 'PA', 'pa': 'PA',
    'papua new guinea': 'PG', 'pg': 'PG',
    'paraguay': 'PY', 'py': 'PY',
    'romania': 'RO', 'ro': 'RO',
    'rwanda': 'RW', 'rw': 'RW',
    'senegal': 'SN', 'sn': 'SN',
    'serbia': 'RS', 'rs': 'RS',
    'slovakia': 'SK', 'sk': 'SK',
    'slovenia': 'SI', 'si': 'SI',
    'somalia': 'SO', 'so': 'SO',
    'tanzania': 'TZ', 'tz': 'TZ',
    'togo': 'TG', 'tg': 'TG',
    'uganda': 'UG', 'ug': 'UG',
    'ukraine': 'UA', 'ua': 'UA',
    'uruguay': 'UY', 'uy': 'UY',
    'uzbekistan': 'UZ', 'uz': 'UZ',
    'zambia': 'ZM', 'zm': 'ZM',
    'zimbabwe': 'ZW', 'zw': 'ZW'
  };
  
  const normalized = countryName.toLowerCase().trim();
  return mapping[normalized] || countryName; // Fallback to original if not found
};

const defaultValues: Partial<SearchFormValues> = {
  page: 1,
  limit: 10,
  filters: {
    location: { ...emptyFilterObj },
    city: { ...emptyFilterObj },
    job_title: { ...emptyFilterObj },
    function: { ...emptyFilterObj },
    past_role: { ...emptyFilterObj },
    past_company: { ...emptyFilterObj },
    company_headcount: { ...emptyFilterObj },
    industry: { ...emptyFilterObj },
    first_name: { ...emptyFilterObj },
    last_name: { ...emptyFilterObj },
    company_name: { ...emptyFilterObj },
    company_location: { ...emptyFilterObj },
      seniority: { ...emptyFilterObj },
      years_in_current_role: { ...emptyFilterObj },
      experience: { ...emptyFilterObj },
      behavioral_keywords: { ...emptyFilterObj },
      language: { ...emptyFilterObj },
    education: { ...emptyFilterObj },
    revenue: { ...emptyFilterObj },
    founded_year: { ...emptyFilterObj },
    expand_job_titles: true,
  }
};

export function SearchRequestBuilder({ fixedType }: { fixedType?: "people" | "companies" }) {
  const { control, watch, register } = useForm<SearchFormValues>({
    defaultValues: {
      ...defaultValues,
      ...(fixedType ? { type: fixedType } : {})
    },
    mode: "onChange"
  });

  const formValues = watch();
  const currentType = fixedType || formValues.type || "people";

  // Transform form values back to API JSON structure
  const transformToApiBody = (data: SearchFormValues) => {
    const body: any = {};
    
    if (data.type) body.type = data.type;
    if (data.page) body.page = Number(data.page);
    if (data.limit) body.limit = Number(data.limit);

    const filters: any = {};

    const transformFilterObj = (obj: FilterObject, isLocation: boolean = false) => {
      let include = obj.include.map(i => i.value).filter(Boolean);
      let exclude = obj.exclude.map(i => i.value).filter(Boolean);
      
      // Silently convert location names to ISO codes for the payload
      if (isLocation) {
        include = include.map(mapCountryToIso);
        exclude = exclude.map(mapCountryToIso);
      }
      
      if (include.length === 0 && exclude.length === 0) return undefined;
      
      const result: any = {};
      if (include.length > 0) result.include = include;
      if (exclude.length > 0) result.exclude = exclude;
      return result;
    };

    const filterKeys: (keyof SearchFormValues["filters"])[] = [
      'location', 'city', 'industry', 'company_headcount', 
      'first_name', 'last_name', 'job_title', 'function', 
      'past_role', 'past_company', 'company_name', 
      'company_location', 'seniority', 'years_in_current_role',
        'experience', 'behavioral_keywords', 'language', 
        'education', 'revenue', 'founded_year'
    ];

    filterKeys.forEach(key => {
      if (data.filters[key]) {
        const isLocationFilter = key === 'location' || key === 'company_location';
        const transformed = transformFilterObj(data.filters[key] as FilterObject, isLocationFilter);
        
        if (transformed) {
          if (key === 'first_name' || key === 'last_name') {
            if (transformed.include && transformed.include.length > 0) {
              filters[key] = transformed.include[0]; // Frontend uses simple string for names
            }
          } else {
            filters[key] = transformed;
          }
        }
      }
    });

    if (currentType === 'people' && data.filters.expand_job_titles !== undefined) {
      filters.expand_job_titles = data.filters.expand_job_titles;
    }

    if (Object.keys(filters).length > 0) {
      body.filters = filters;
    }

    return body;
  };

  const apiBody = transformToApiBody(formValues);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left Column: Visual Builder */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Request Parameters</h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!fixedType && (
                  <div className="space-y-2">
                    <Label>Search Type</Label>
                    <Controller
                      control={control}
                      name="type"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="people">People</SelectItem>
                            <SelectItem value="companies">Companies</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 md:col-span-1">
                  <div className="space-y-2 group">
                    <Label className="flex items-center gap-1.5">
                      Page
                    </Label>
                    <Input type="number" {...register("page", { valueAsNumber: true })} min={1} />
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      "Page" specifies which subset of results to fetch. Default is 1 both for people search and company search.
                    </p>
                  </div>
                  <div className="space-y-2 group">
                    <Label className="flex items-center gap-1.5">
                      Limit
                    </Label>
                    <Input type="number" {...register("limit", { valueAsNumber: true })} min={1} max={50} />
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      "Limit" restricts the maximum number of results returned per page. Default is 10, Max is 50.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="w-full space-y-4">
                {/* Common Filters */}
                {/* Companies Only Filters */}
                {currentType === 'companies' && (
                  <>
                    <FilterSection 
                      title="Company Name" 
                      name="company_name" 
                      control={control} 
                      register={register} 
                      dynamicApiUrl="https://backbeta.mawsool.tech/api/proxy/companies/suggest"
                      transformResponse={(json) => (Array.isArray(json) ? json : json.data || []).map((c: any) => `${c.name}|||${c.domain || c.name}`)}
                    />
                    <FilterSection title="Location (Country)" name="location" control={control} register={register} options={parsedFilters.locations} />
                    <FilterSection title="Industry" name="industry" control={control} register={register} options={parsedFilters.industries} />
                    <FilterSection title="Company Headcount" name="company_headcount" control={control} register={register} options={parsedFilters.companyHeadcounts} />
                    <FilterSection title="Revenue" name="revenue" control={control} register={register} options={parsedFilters.revenueRanges} />
                    <FilterSection title="HQ Location" name="company_location" control={control} register={register} options={parsedFilters.locations} />
                    <FilterSection 
                      title="City" 
                      name="city" 
                      control={control} 
                      register={register} 
                      dynamicApiUrl="https://backbeta.mawsool.tech/search-ids/cities"
                      transformResponse={(json) => (json.data || []).map((c: any) => c.name)}
                    />
                    <FilterSection title="Founded Year" name="founded_year" control={control} register={register} options={parsedFilters.foundedYearRanges} />
                  </>
                )}

                {/* People Only Filters */}
                {currentType === 'people' && (
                  <>
                    <FilterSection title="Current Role / Job Title" name="job_title" control={control} register={register} options={jobTitles} />
                    <FilterSection title="First Name" name="first_name" control={control} register={register} />
                    <FilterSection title="Last Name" name="last_name" control={control} register={register} />
                    <FilterSection title="Location (Country)" name="location" control={control} register={register} options={parsedFilters.locations} />
                    <FilterSection title="Industry" name="industry" control={control} register={register} options={parsedFilters.industries} />
                    <FilterSection title="Company Headcount" name="company_headcount" control={control} register={register} options={parsedFilters.companyHeadcounts} />
                    <FilterSection 
                      title="Current Company Name" 
                      name="company_name" 
                      control={control} 
                      register={register} 
                      dynamicApiUrl="https://backbeta.mawsool.tech/api/proxy/companies/suggest"
                      transformResponse={(json) => (Array.isArray(json) ? json : json.data || []).map((c: any) => `${c.name}|||${c.domain || c.name}`)}
                    />
                    <FilterSection title="HQ Location" name="company_location" control={control} register={register} options={parsedFilters.locations} />
                    <FilterSection 
                      title="City" 
                      name="city" 
                      control={control} 
                      register={register} 
                      dynamicApiUrl="https://backbeta.mawsool.tech/search-ids/cities"
                      transformResponse={(json) => (json.data || []).map((c: any) => c.name)}
                    />
                    <FilterSection title="Department" name="function" control={control} register={register} options={parsedFilters.jobFunctions} />
                    <FilterSection title="Seniority" name="seniority" control={control} register={register} options={parsedFilters.seniorities} />

                    <FilterSection title="Behavioral Keywords" name="behavioral_keywords" control={control} register={register} />
                    <FilterSection title="Years in Current Company" name="years_in_current_role" control={control} register={register} options={parsedFilters.experienceRanges} />
                    <FilterSection title="Total Experience (Years)" name="experience" control={control} register={register} options={parsedFilters.experienceRanges} />
                    <FilterSection 
                      title="Education / School" 
                      name="education" 
                      control={control} 
                      register={register} 
                      dynamicApiUrl="https://backbeta.mawsool.tech/search-ids/education"
                      transformResponse={(json) => (json.items || []).map((e: any) => e.name)}
                    />
                    <FilterSection title="Past Role" name="past_role" control={control} register={register} options={jobTitles} />
                    <FilterSection title="Language" name="language" control={control} register={register} options={parsedFilters.languages} />
                    <FilterSection 
                      title="Past Company Name" 
                      name="past_company" 
                      control={control} 
                      register={register} 
                      dynamicApiUrl="https://backbeta.mawsool.tech/api/proxy/companies/suggest"
                      transformResponse={(json) => (Array.isArray(json) ? json : json.data || []).map((c: any) => `${c.name}|||${c.domain || c.name}`)}
                    />
                    
                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Expand Job Titles</Label>
                        <Controller
                          control={control}
                          name="filters.expand_job_titles"
                          render={({ field }) => (
                            <Select value={field.value === false ? "false" : "true"} onValueChange={(v) => field.onChange(v === "true")}>
                              <SelectTrigger className="w-25">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">True</SelectItem>
                                <SelectItem value="false">False</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        When true, searches for related variations of the job title.
                      </p>
                    </div>

                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Column: Code & Testing */}
      <div className="space-y-6 sticky top-20">
        <div>
          <h2 className="text-lg font-semibold mb-4">Code Snippets</h2>
          <CodeSample method="POST" path="/search" body={apiBody} />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Test Request</h2>
          <ApiTester method="POST" path="/search" body={apiBody} />
        </div>
      </div>
    </div>
  );
}

function FilterSection({ title, name, control, register, options, dynamicApiUrl, transformResponse }: { title: string, name: string, control: any, register: any, options?: string[], dynamicApiUrl?: string, transformResponse?: (data: any) => string[] }) {
  const { fields: includeFields, append: appendInclude, remove: removeInclude } = useFieldArray({
    control,
    name: `filters.${name}.include`
  });

  const { fields: excludeFields, append: appendExclude, remove: removeExclude } = useFieldArray({
    control,
    name: `filters.${name}.exclude`
  });

  const [dynamicOptions, setDynamicOptions] = useState<string[]>([]);
  const datalistId = `datalist-${name}`;

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!dynamicApiUrl) return;
    const val = e.target.value;
    if (val.length < 2) return;
    try {
      const res = await fetch(`${dynamicApiUrl}?q=${encodeURIComponent(val)}`);
      const json = await res.json();
      const mapped = transformResponse ? transformResponse(json) : [];
      setDynamicOptions(mapped);
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  };

  const finalOptions = options || (dynamicOptions.length > 0 ? dynamicOptions : undefined);

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="space-y-4 pt-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Include</Label>
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => appendInclude({ value: "" })}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {includeFields.length === 0 && <p className="text-xs text-muted-foreground italic">No included items</p>}
          {includeFields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input 
                id={`include-${name}-${index}-${Math.random().toString(36).substring(7)}`}
                name={`include-dummy-${name}-${index}`}
                className="h-8 text-sm" 
                placeholder={`E.g., value...`}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                list={finalOptions ? datalistId : undefined}
                {...register(`filters.${name}.include.${index}.value`)} 
                onChange={(e) => {
                  register(`filters.${name}.include.${index}.value`).onChange(e);
                  handleInput(e);
                }}
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeInclude(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Exclude</Label>
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => appendExclude({ value: "" })}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {excludeFields.length === 0 && <p className="text-xs text-muted-foreground italic">No excluded items</p>}
          {excludeFields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input 
                id={`exclude-${name}-${index}-${Math.random().toString(36).substring(7)}`}
                name={`exclude-dummy-${name}-${index}`}
                className="h-8 text-sm" 
                placeholder={`E.g., value...`}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                list={finalOptions ? datalistId : undefined}
                {...register(`filters.${name}.exclude.${index}.value`)} 
                onChange={(e) => {
                  register(`filters.${name}.exclude.${index}.value`).onChange(e);
                  handleInput(e);
                }}
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeExclude(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      
      {finalOptions && finalOptions.length > 0 && (
        <datalist id={datalistId}>
          {finalOptions.map((opt, i) => (
            <option key={i} value={opt} />
          ))}
        </datalist>
      )}
    </div>
  );
}
