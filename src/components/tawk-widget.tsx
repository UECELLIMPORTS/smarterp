'use client'

/**
 * Widget de chat ao vivo (Tawk.to).
 *
 * Só renderiza se NEXT_PUBLIC_TAWK_TO_SRC estiver configurada.
 * O valor deve ser a URL completa do script Tawk no formato:
 *   https://embed.tawk.to/<PROPERTY_ID>/<WIDGET_ID>
 *
 * Tawk.to é gratuito e tem widget próprio. Crie conta em tawk.to,
 * adicione um property + widget, copie a URL do snippet "Direct chat link"
 * (ou pegue do <script src=...> instalado).
 */

import Script from 'next/script'

export function TawkWidget() {
  const src = process.env.NEXT_PUBLIC_TAWK_TO_SRC
  if (!src) return null

  return (
    <Script
      id="tawk-to"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{
        __html: `
          var Tawk_API = Tawk_API || {}, Tawk_LoadStart = new Date();
          (function(){
            var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
            s1.async = true;
            s1.src = ${JSON.stringify(src)};
            s1.charset = 'UTF-8';
            s1.setAttribute('crossorigin', '*');
            s0.parentNode.insertBefore(s1, s0);
          })();
        `,
      }}
    />
  )
}
