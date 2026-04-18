/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F3F1E9',       // 霧白頁面底
        card: '#FFFFFF',     // 卡片底
        ink: '#1A2420',      // 墨綠黑主文字
        'ink-2': '#3F4A44',  // 次文字
        'ink-3': '#6B7A6B',  // 輔助文字
        sage: '#4A6B4A',     // 鼠尾草綠
        'sage-deep': '#2F4A2F',  // 深林綠
        honey: '#B8781F',    // 蜂蜜金（深）
        'honey-soft': '#D9A441', // 蜂蜜金（淡）
        stone: '#8A8074',    // 石灰
        divider: '#D8D3C2',  // 分隔線
        hint: '#F7F4EA'      // 次要卡片底
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif TC"', 'ui-serif', 'Georgia', 'serif'],
        num: ['"Noto Sans TC"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      fontSize: {
        hero: ['76px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'hero-sm': ['56px', { lineHeight: '1', letterSpacing: '-0.02em' }]
      },
      borderRadius: {
        card: '20px',
        btn: '16px'
      },
      boxShadow: {
        card: '0 1px 3px rgba(26,36,32,0.04), 0 8px 24px rgba(26,36,32,0.06)'
      }
    }
  },
  plugins: []
};
