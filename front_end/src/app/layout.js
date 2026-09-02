import ClientWrapper from "@/components/ClientWrapper";
import AxiosConfig from "./AxiosConfig"; // <--- Imported here
import CanonicalTag from "@/components/CanonicalTag";
import UtmTracker from "@/components/UtmTracker";
import Script from "next/script";
import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://mawsool.tech"),
  title: "Mawsool",
  description: "B2B Lead Intelligence Platform",
  icons: {
    icon: "/basic/favicon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Google Tag Manager */}
        <Script
          id="gtm-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-K37X2935');
            `,
          }}
        />
        {/* End Google Tag Manager */}

        {/* Dynamic Canonical Tag */}
        <CanonicalTag />
        
        {/* We have removed the hardcoded GA4 tag because GA4 should now be deployed INSIDE Google Tag Manager instead */}

        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=search"
        />
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="beforeInteractive" />

        {/* Leadfeeder Tracking Script */}
        <Script
          id="leadfeeder-tracking"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(ss,ex){
                window.ldfdr=window.ldfdr||function(){(ldfdr._q=ldfdr._q||[]).push([].slice.call(arguments));};
                (function(d,s){
                  fs=d.getElementsByTagName(s)[0];
                  function ce(src){
                    var cs=d.createElement(s);
                    cs.src=src;
                    cs.async=1;
                    fs.parentNode.insertBefore(cs,fs);
                  };
                  ce('https://sc.lfeeder.com/lftracker_v1_'+ss+(ex?'_'+ex:'')+'.js');
                })(document,'script');
              })('ywVkO4Xxdbp4Z6Bj');
            `,
          }}
        />


      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-K37X2935"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          ></iframe>
        </noscript>
        {/* End Google Tag Manager (noscript) */}

        {/* Run the Axios Config fix immediately */}
        <AxiosConfig />
        <UtmTracker />
        
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  );
}