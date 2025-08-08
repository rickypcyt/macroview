"use client";

import { useEffect, useState } from 'react';

import { loadCountryGDP } from '../utils/dataService';

// No props currently required

interface CountryData {
  name: string;
  iso2: string;
  gdpGrowth?: number;
  inflation?: number;
  interestRate?: number;
  unemployment?: number;
  laborForceParticipation?: number;
  easeOfDoingBusiness?: number;
  legalFramework?: string;
  digitalReadiness?: string;
  marketMaturity?: string;
}

interface WorldBankCountry {
  id: string;
  name: string;
  iso2Code: string;
}

const INDICATORS = [
  'GDP Growth (2025 projection)',
  'Inflation (Q2 2025 YoY)',
  'Interest Rate (Q2 2025)',
  'Unemployment Rate (Q2 2025)',
  'Labor Force Participation (%)',
  'Ease of Doing Business',
  'Legal Framework (Factoring/ABL)',
  'Digital/Fintech Readiness',
  'Market Maturity (Factoring/ABL)'
];

export default function ComparisonTable() {
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [worldBankCountries, setWorldBankCountries] = useState<WorldBankCountry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCountries, setFilteredCountries] = useState<WorldBankCountry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  // Load World Bank countries list
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=300');
        const data = await response.json();
        if (Array.isArray(data) && Array.isArray(data[1])) {
          interface WorldBankAPICountryRaw {
            id: string;
            name: string;
            iso2Code: string;
            region?: { value?: string };
            incomeLevel?: { value?: string };
          }
          const validCountries = (data[1] as WorldBankAPICountryRaw[])
            .filter((country: WorldBankAPICountryRaw) => country.region?.value !== 'Aggregates' && !!country.incomeLevel?.value)
            .map((country: WorldBankAPICountryRaw) => ({
              id: country.id,
              name: country.name,
              iso2Code: country.iso2Code
            }));
          setWorldBankCountries(validCountries);
        }
      } catch (error) {
        console.error('Error loading countries:', error);
      }
    };

    loadCountries();
  }, []);

  // Filter countries based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredCountries([]);
      setSelectedIndex(-1);
      return;
    }

    const filtered = worldBankCountries
      .filter(country => 
        country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        country.iso2Code.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .slice(0, 10); // Limit to 10 results

    setFilteredCountries(filtered);
    setSelectedIndex(-1); // Reset selection when search changes
  }, [searchTerm, worldBankCountries]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredCountries.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCountries.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCountries.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredCountries.length) {
          addCountry(filteredCountries[selectedIndex]);
          setSearchTerm('');
          setSelectedIndex(-1);
        }
        break;
      case 'Escape':
        setSearchTerm('');
        setSelectedIndex(-1);
        break;
    }
  };

  const addCountry = async (country: WorldBankCountry) => {
    if (countries.find(c => c.iso2 === country.iso2Code)) {
      return; // Country already added
    }

    setLoading(true);
    const newCountry: CountryData = {
      name: country.name,
      iso2: country.iso2Code
    };

    try {
      // Fetch GDP data
      const gdp = await loadCountryGDP(country.name);
      if (gdp) {
        newCountry.gdpGrowth = 2.4; // Mock for now, could be calculated from historical data
      }

      // Fetch inflation data
      try {
        const inflationResponse = await fetch(
          `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1`
        );
        const inflationData = await inflationResponse.json();
        if (Array.isArray(inflationData) && Array.isArray(inflationData[1]) && inflationData[1][0]) {
          newCountry.inflation = inflationData[1][0].value;
        }
      } catch (error) {
        console.error('Error fetching inflation:', error);
      }

      // Fetch interest rate data
      try {
        const interestResponse = await fetch(
          `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/FR.INR.RINR?format=json&per_page=1`
        );
        const interestData = await interestResponse.json();
        if (Array.isArray(interestData) && Array.isArray(interestData[1]) && interestData[1][0]) {
          newCountry.interestRate = interestData[1][0].value;
        }
      } catch (error) {
        console.error('Error fetching interest rate:', error);
      }

      // Fetch unemployment data
      try {
        const unemploymentResponse = await fetch(
          `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/SL.UEM.TOTL.ZS?format=json&per_page=1`
        );
        const unemploymentData = await unemploymentResponse.json();
        if (Array.isArray(unemploymentData) && Array.isArray(unemploymentData[1]) && unemploymentData[1][0]) {
          newCountry.unemployment = unemploymentData[1][0].value;
        }
      } catch (error) {
        console.error('Error fetching unemployment:', error);
      }

      // Fetch labor force participation
      try {
        const laborResponse = await fetch(
          `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/SL.TLF.CACT.ZS?format=json&per_page=1`
        );
        const laborData = await laborResponse.json();
        if (Array.isArray(laborData) && Array.isArray(laborData[1]) && laborData[1][0]) {
          newCountry.laborForceParticipation = laborData[1][0].value;
        }
      } catch (error) {
        console.error('Error fetching labor force participation:', error);
      }

      // Mock data for other indicators (these would need specific APIs)
      newCountry.easeOfDoingBusiness = Math.floor(Math.random() * 40) + 60; // 60-100
      newCountry.legalFramework = ['Basic', 'Intermediate', 'Advanced'][Math.floor(Math.random() * 3)];
      newCountry.digitalReadiness = ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)];
      newCountry.marketMaturity = ['Emerging', 'Developing', 'Mature'][Math.floor(Math.random() * 3)];

    } catch (error) {
      console.error('Error adding country:', error);
    } finally {
      setLoading(false);
    }

    setCountries(prev => [...prev, newCountry]);
    setSearchTerm('');
  };

  const removeCountry = (iso2: string) => {
    setCountries(prev => prev.filter(c => c.iso2 !== iso2));
  };

  const getIndicatorValue = (country: CountryData, indicatorIndex: number): string => {
    switch (indicatorIndex) {
      case 0: // GDP Growth
        return country.gdpGrowth ? `${country.gdpGrowth > 0 ? '+' : ''}${country.gdpGrowth.toFixed(1)}%` : 'N/A';
      case 1: // Inflation
        return country.inflation ? `${country.inflation.toFixed(1)}%` : 'N/A';
      case 2: // Interest Rate
        return country.interestRate ? `${country.interestRate.toFixed(2)}%` : 'N/A';
      case 3: // Unemployment
        return country.unemployment ? `${country.unemployment.toFixed(1)}%` : 'N/A';
      case 4: // Labor Force Participation
        return country.laborForceParticipation ? `${country.laborForceParticipation.toFixed(1)}%` : 'N/A';
      case 5: // Ease of Doing Business
        return country.easeOfDoingBusiness ? `${country.easeOfDoingBusiness}/100` : 'N/A';
      case 6: // Legal Framework
        return country.legalFramework || 'N/A';
      case 7: // Digital Readiness
        return country.digitalReadiness || 'N/A';
      case 8: // Market Maturity
        return country.marketMaturity || 'N/A';
      default:
        return 'N/A';
    }
  };

  const getIndicatorColor = (country: CountryData, indicatorIndex: number): string => {
    const value = getIndicatorValue(country, indicatorIndex);
    if (value === 'N/A') return 'bg-gray-900/50 text-gray-500 border-gray-700';

    switch (indicatorIndex) {
      case 0: // GDP Growth
        const gdpGrowth = parseFloat(value.replace('%', ''));
        return gdpGrowth > 0 ? 'bg-green-900/50 text-green-300 border-green-700' : 'bg-red-900/50 text-red-300 border-red-700';
      case 1: // Inflation
        const inflation = parseFloat(value.replace('%', ''));
        return inflation > 5 ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-green-900/50 text-green-300 border-green-700';
      case 2: // Interest Rate
        return 'bg-blue-900/50 text-blue-300 border-blue-700';
      case 3: // Unemployment
        const unemployment = parseFloat(value.replace('%', ''));
        return unemployment > 8 ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-green-900/50 text-green-300 border-green-700';
      case 4: // Labor Force Participation
        return 'bg-purple-900/50 text-purple-300 border-purple-700';
      case 5: // Ease of Doing Business
        const easeScore = parseInt(value.split('/')[0]);
        return easeScore > 80 ? 'bg-green-900/50 text-green-300 border-green-700' : 
               easeScore > 60 ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' : 
               'bg-red-900/50 text-red-300 border-red-700';
      case 6: // Legal Framework
        return value === 'Advanced' ? 'bg-green-900/50 text-green-300 border-green-700' :
               value === 'Intermediate' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
               'bg-red-900/50 text-red-300 border-red-700';
      case 7: // Digital Readiness
        return value === 'High' ? 'bg-green-900/50 text-green-300 border-green-700' :
               value === 'Medium' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
               'bg-red-900/50 text-red-300 border-red-700';
      case 8: // Market Maturity
        return value === 'Mature' ? 'bg-green-900/50 text-green-300 border-green-700' :
               value === 'Developing' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
               'bg-red-900/50 text-red-300 border-red-700';
      default:
        return 'bg-gray-900/50 text-gray-300 border-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col overflow-y-auto bg-black">
      <div className="w-full px-24 pb-16">
        <div className="w-full space-y-12 mt-8">
                    {/* Header Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Economic Indicators Comparison
              </h1>
              
              {/* Search */}
              <div className="flex justify-center">
                <div className="relative w-96">
                  <input
                    type="text"
                    placeholder="🔍 Add country to table..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 backdrop-blur-sm text-base"
                  />
                  {filteredCountries.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl z-[9999] max-h-48 overflow-y-auto">
                      {filteredCountries.map((country, index) => (
                        <button
                          key={country.id}
                          onClick={() => {
                            addCountry(country);
                            setSearchTerm('');
                            setSelectedIndex(-1);
                          }}
                          className={`w-full px-4 py-3 text-left transition-colors border-b border-white/10 last:border-b-0 text-base ${
                            index === selectedIndex 
                              ? 'bg-blue-600/50 text-white' 
                              : 'hover:bg-white/10 text-white'
                          }`}
                        >
                          <div className="font-medium">{country.name}</div>
                          <div className="text-sm text-gray-400">{country.iso2Code}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Comparison Table Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
            <div className="overflow-x-auto">
              {/* Header Row */}
              <div className="flex bg-white/5 border-b border-white/20 min-w-max">
                <div className="flex-shrink-0 p-4 font-semibold text-white border-r border-white/20 w-[180px] text-center text-base">
                  Indicators
                </div>
                {countries.map((country) => (
                  <div key={country.iso2} className="flex-shrink-0 p-4 font-semibold text-white border-r border-white/20 w-[140px]">
                    <div className="relative flex items-center justify-center">
                      <span className="truncate text-base text-center">{country.name}</span>
                      <button
                        onClick={() => removeCountry(country.iso2)}
                        className="absolute right-0 text-gray-400 hover:text-red-400 transition-colors text-base flex-shrink-0"
                        title="Remove country"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

              </div>

              {/* Data Rows */}
              {INDICATORS.map((indicator, index) => (
                <div key={indicator} className={`flex border-b border-white/10 hover:bg-white/5 transition-colors min-w-max ${
                  index % 2 === 0 ? 'bg-white/5' : 'bg-transparent'
                }`}>
                  <div className="flex-shrink-0 p-4 font-medium text-blue-300 border-r border-white/20 w-[180px] text-base text-center">
                    {indicator}
                  </div>
                  {countries.map((country) => (
                    <div key={`${country.iso2}-${index}`} className="flex-shrink-0 p-4 text-gray-300 border-r border-white/20 w-[140px] flex items-center justify-center">
                      <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-base font-medium border ${getIndicatorColor(country, index)}`}>
                        {getIndicatorValue(country, index)}
                      </span>
                    </div>
                  ))}

                </div>
              ))}
            </div>
          </div>



          {loading && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white/10 backdrop-blur-sm p-8 rounded-2xl border border-white/20 shadow-2xl">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-white text-lg">Loading country data...</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
