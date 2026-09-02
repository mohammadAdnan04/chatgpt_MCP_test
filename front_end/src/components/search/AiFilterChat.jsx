import React, { useState } from 'react';
import axios from 'axios';
import Tabs from "@/components/search/Tabs";

const AiFilterChat = ({ searchFilter, setSearchFilter, searchMode, isSearched, setFiltersVisible, onTabChange, filtersVisible, setAiSearchQuery, setAiContext, forceFullPage }) => {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userText = input.trim();
        setInput('');
        setIsLoading(true);

        // Open the filters panel when submitting a query (only if not forced full page)
        if (setFiltersVisible && !forceFullPage) {
            setFiltersVisible(true);
        }

        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            
            const response = await axios.post(
                `${apiUrl}/api/ai/parse-filters`,
                { query: userText, searchMode },
                {
                    withCredentials: true,
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                }
            );

            if (response.data && response.data.filters) {
                setSearchFilter(prev => ({ ...prev, ...response.data.filters }));
                if (setAiContext && setAiSearchQuery) {
                    setAiContext({
                        originalPrompt: userText,
                        isSemanticNeeded: response.data.isSemanticNeeded,
                        semanticSentences: response.data.semanticSentences
                    });
                    setAiSearchQuery(true);
                }
            }
        } catch (error) {
            console.error("AI parsing failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Check if there are any active filters
    const hasFilters = searchFilter && Object.keys(searchFilter).length > 0;
    const shouldShowFloatingBar = !forceFullPage && (isSearched || hasFilters || filtersVisible);

    if (!shouldShowFloatingBar) {
        return (
            <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center p-4 transition-all duration-500 ease-in-out">
                <div className="w-full max-w-4xl flex flex-col">
                    <div className="text-center space-y-4 mb-8 animate-in fade-in zoom-in duration-500">
                        <div className="w-16 h-16 bg-[#F0F7FF] rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#D0E3FF]">
                            <img alt="AI" className="w-8 h-8 invert-[0.3] sepia-[1] saturate-[3] hue-rotate-[200deg]" src="/icons/magicAI.svg" />
                        </div>
                        <h1 className="text-3xl font-semibold text-[#222]">What kind of {searchMode === 'companies' ? 'companies' : 'leads'} are you looking for?</h1>
                        <p className="text-[#666] max-w-lg mx-auto">Describe your ideal target in plain English, and our AI will automatically configure the perfect search filters for you.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex items-center gap-3 relative max-w-4xl mx-auto w-full mb-6">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="e.g. Software engineers in UAE with 5+ years experience..."
                            className="flex-1 text-sm pl-6 pr-14 py-4 rounded-full border border-[#D0E3FF] focus:outline-none focus:ring-2 focus:ring-[#04145C] bg-white shadow-lg"
                            disabled={isLoading}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 disabled:opacity-50 transition-transform hover:scale-110 flex items-center justify-center"
                        >
                            {isLoading ? (
                                <div className="animate-spin h-5 w-5 border-2 border-[#04145C] border-t-transparent rounded-full" />
                            ) : (
                                <img src="/basic/icon128.png" alt="Submit" className="w-[50px] h-[50px] opacity-70 hover:opacity-100 transition-opacity mix-blend-multiply" />
                            )}
                        </button>
                    </form>

                    <div className="flex justify-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Tabs activeTab={searchMode} onTabChange={onTabChange} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full z-[100] pointer-events-none">
            {/* 
              We use pointer-events-none on the wrapper so we can click through it to the table,
              but we restore pointer-events-auto on the actual visible elements.
            */}
            
            {/* The Mascot (Minimized State) */}
            <div className={`absolute -right-8 top-[-75px] z-[110] transition-all duration-500 transform origin-right ${isMinimized ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' : 'opacity-0 translate-x-16 scale-50 pointer-events-none'}`}>
                <button 
                    onClick={() => setIsMinimized(false)}
                    className="relative cursor-pointer group flex items-center focus:outline-none"
                    title="Open AI Filter"
                >
                    {/* Speech Bubble */}
                    <div className="absolute right-[100px] top-10 bg-white shadow-lg border border-[#E5E6E6] rounded-2xl rounded-br-sm px-4 py-2 text-sm font-semibold text-[#04145C] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                        Need help?
                    </div>
                    
                    <img 
                        alt="AI Assistant" 
                        className="h-[140px] px-[10px] mx-0 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-2 origin-bottom drop-shadow-md" 
                        src="/robot-assistant-v3.png" 
                    />
                </button>
            </div>

            {/* The Search Bar (Maximized State) */}
            <div className={`w-full z-[100] transition-all duration-500 transform origin-right ${!isMinimized ? 'relative opacity-100 translate-x-0 scale-100 pointer-events-auto mb-2' : 'absolute top-0 opacity-0 translate-x-16 scale-95 pointer-events-none'}`}>
                <div className="flex items-center bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-[#E5E6E6] p-2 gap-2 relative w-full">
                    <div className="flex items-center justify-center w-8 h-8 bg-[#F0F7FF] rounded-lg ml-1 shrink-0">
                        <img alt="AI" className="w-5 h-5 invert-[0.3] sepia-[1] saturate-[3] hue-rotate-[200deg]" src="/icons/magicAI.svg" />
                    </div>
                    
                    <form onSubmit={handleSubmit} className="flex-1 flex items-center relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={`Ask AI to filter ${searchMode === 'companies' ? 'companies' : 'leads'}...`}
                            className="w-full text-sm pl-3 pr-12 py-2 bg-transparent focus:outline-none"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 disabled:opacity-50 transition-transform hover:scale-110 flex items-center justify-center"
                        >
                            {isLoading ? (
                                <div className="animate-spin h-4 w-4 border-2 border-[#04145C] border-t-transparent rounded-full" />
                            ) : (
                                <img src="/basic/icon128.png" alt="Submit" className="w-[40px] h-[40px] opacity-70 hover:opacity-100 transition-opacity mix-blend-multiply" />
                            )}
                        </button>
                    </form>

                    <div className="w-[1px] h-6 bg-[#E5E6E6] mx-1"></div>

                    <button 
                        onClick={() => setIsMinimized(true)}
                        className="p-2 text-[#666] hover:bg-[#F0F7FF] hover:text-[#04145C] rounded-lg transition-colors shrink-0"
                        title="Minimize AI Search"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AiFilterChat;