"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";
import { City, Country } from "country-state-city";

const CityFilter = ({ onChange, value, initialValue, selectedCountry }) => {
  const propValue = value || initialValue;
  const showExclude = false; // Consistency with CountryFilter

  const [cityFilter, setCityFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const [selectedItemsMap, setSelectedItemsMap] = useState({
    include: propValue?.includeLabels || {},
    exclude: propValue?.excludeLabels || {},
  });

  // Compute the pool of cities to search within
  const cityPool = useMemo(() => {
    // If a specific country is selected in the parent filters
    if (selectedCountry && selectedCountry.include && selectedCountry.include.length > 0) {
      const countryNames = selectedCountry.include;
      const allCountries = Country.getAllCountries();

      let pool = [];
      // For each selected country name, find its ISO code and get its cities  
      countryNames.forEach(countryName => {
        let searchName = countryName.toLowerCase().trim();
        
        // Map common inputs directly to ISO to be perfectly safe
        if (searchName === "saudi arabia" || searchName === "ksa") searchName = "SA";
        else if (searchName === "united arab emirates" || searchName === "uae") searchName = "AE";
        else if (searchName === "united states" || searchName === "usa" || searchName === "us") searchName = "US";
        else if (searchName === "united kingdom" || searchName === "uk") searchName = "GB";

        const countryObj = allCountries.find(c => {
          const libName = c.name.toLowerCase();
          const libIso = c.isoCode.toLowerCase();
          
          return libName === searchName || 
                 libIso === searchName || 
                 (searchName.length > 3 && libName.includes(searchName));
        });

        if (countryObj) {
          pool = [...pool, ...City.getCitiesOfCountry(countryObj.isoCode)];    
        }
      });

      return pool.length > 0 ? pool : City.getAllCities();
    }

    // Fallback: Return all cities in the world if no country is selected      
    return City.getAllCities();
  }, [selectedCountry]);

  // A custom function to handle local suggestions instead of hitting an API   
  const fetchLocalSuggestions = async (query) => {
    // If there's no query, just return the first 100 cities from the pool     
    if (!query) {
      const topCities = cityPool.slice(0, 100);
      const uniqueMatches = Array.from(new Set(topCities.map(c => c.name)))    
        .map(name => ({ id: name, title: name }));
      return { data: uniqueMatches };
    }

    const searchTerm = query.toLowerCase();

    const matches = cityPool
      .filter(city => city.name.toLowerCase().startsWith(searchTerm))
      .slice(0, 100); // Limit to 100 results for performance, scrollable      

    // Deduplicate names (sometimes cities have same names in different states)
    const uniqueMatches = Array.from(new Set(matches.map(c => c.name)))        
      .map(name => ({ id: name, title: name }));

    // We mock the axios response structure that AutoSuggestInput expects      
    return { data: uniqueMatches };
  };

  const normalizeItem = (item) => {
    if (item !== null && typeof item !== "object") {
      return { id: item, title: String(item) };
    }
    const id = item?.id ?? item?.name ?? item?.text ?? item?.title;
    const title = item?.title ?? item?.name ?? item?.text ?? (id != null ? String(id) : "");
    return { id, title };
  };

  const notifyChange = (newFilter, includeLabelsOverride, excludeLabelsOverride) => {
    if (!onChange) return;
    const includeLabels = includeLabelsOverride ?? selectedItemsMap.include;
    const excludeLabels = excludeLabelsOverride ?? selectedItemsMap.exclude;

    onChange({
      include: newFilter.include,
      exclude: newFilter.exclude,
      includeLabels,
      excludeLabels,
    });
  };

  useEffect(() => {
    if (!propValue) {
        setCityFilter({ include: [], exclude: [] });
        setSelectedItemsMap({ include: {}, exclude: {} });
        return;
      }
    const newInclude = propValue.include || [];
    const newExclude = propValue.exclude || [];
    setCityFilter({ include: newInclude, exclude: newExclude });

    if (propValue.includeLabels && Object.keys(propValue.includeLabels).length) {
      setSelectedItemsMap((prev) => ({
        ...prev,
        include: { ...prev.include, ...propValue.includeLabels },
      }));
    }
    if (propValue.excludeLabels && Object.keys(propValue.excludeLabels).length) {
      setSelectedItemsMap((prev) => ({
        ...prev,
        exclude: { ...prev.exclude, ...propValue.excludeLabels },
      }));
    }
  }, [JSON.stringify(propValue)]);

  const handleSelect = (type) => (rawItem) => {
    const { id, title } = normalizeItem(rawItem);
    if (id == null) return;
    if (cityFilter[type].some((x) => String(x) === String(id))) return;

    const newFilter = {
      ...cityFilter,
      [type]: [...cityFilter[type], id],
    };

    const nextIncludeLabels = type === "include" 
      ? { ...selectedItemsMap.include, [String(id)]: title }
      : { ...selectedItemsMap.include };

    const nextExcludeLabels = type === "exclude"
      ? { ...selectedItemsMap.exclude, [String(id)]: title }
      : { ...selectedItemsMap.exclude };

    setCityFilter(newFilter);
    setSelectedItemsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });
    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  const handleRemove = (type) => (idToRemove) => {
    const newFilter = {
      ...cityFilter,
      [type]: cityFilter[type].filter((x) => String(x) !== String(idToRemove)),
    };

    const nextIncludeLabels = { ...selectedItemsMap.include };
    const nextExcludeLabels = { ...selectedItemsMap.exclude };
    if (type === "include") delete nextIncludeLabels[String(idToRemove)];
    else delete nextExcludeLabels[String(idToRemove)];

    setCityFilter(newFilter);
    setSelectedItemsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });
    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <AutoSuggestInput
          placeholder="Enter City Name"
          customFetch={fetchLocalSuggestions} // Bypass the API URL and use local function
          onSelect={handleSelect("include")}
          responseSuggestions={(res) => Array.isArray(res?.data) ? res.data : []}
          selectedItems={cityFilter.include}
          allowCustomInput={true}
          dependencyDependency={JSON.stringify(selectedCountry)} // Re-fetch when country changes
        />
        <div className="flex flex-wrap gap-2">
          {cityFilter.include.map((id) => (
            <FilterTag
              key={String(id)}
              text={selectedItemsMap.include[String(id)] || String(id)}
              onRemove={() => handleRemove("include")(id)}
            />
          ))}
        </div>
      </div>

      {showExclude && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[#222222]">Exclude</p>
          <AutoSuggestInput
            placeholder="Enter City to Exclude"
            customFetch={fetchLocalSuggestions} // Bypass the API URL and use local function
            onSelect={handleSelect("exclude")}
            responseSuggestions={(res) => Array.isArray(res?.data) ? res.data : []}
            selectedItems={cityFilter.exclude}
            allowCustomInput={true}
            dependencyDependency={JSON.stringify(selectedCountry)} // Re-fetch when country changes
          />
          <div className="flex flex-wrap gap-2">
            {cityFilter.exclude.map((id) => (
              <FilterTag
                key={String(id)}
                text={selectedItemsMap.exclude[String(id)] || String(id)}
                onRemove={() => handleRemove("exclude")(id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CityFilter;
