"use client";

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function UtmTrackerInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Only run on the client side
    if (typeof window !== 'undefined') {
      const utmSource = searchParams.get('utm_source');
      const utmMedium = searchParams.get('utm_medium');
      const utmCampaign = searchParams.get('utm_campaign');
      const utmTerm = searchParams.get('utm_term');
      const utmContent = searchParams.get('utm_content');

      // Only save if at least utm_source or utm_campaign exists
      if (utmSource || utmCampaign) {
        const utmData = {
          utm_source: utmSource || '',
          utm_medium: utmMedium || '',
          utm_campaign: utmCampaign || '',
          utm_term: utmTerm || '',
          utm_content: utmContent || ''
        };

        // Save to localStorage
        localStorage.setItem('mawsool_utm_data', JSON.stringify(utmData));
      }
    }
  }, [searchParams]);

  return null; // This component doesn't render anything visually
}

export default function UtmTracker() {
  return (
    <Suspense fallback={null}>
      <UtmTrackerInner />
    </Suspense>
  );
}
