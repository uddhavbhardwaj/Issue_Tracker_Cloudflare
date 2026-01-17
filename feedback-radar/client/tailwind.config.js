/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                // Cloudflare Brand Colors
                cf: {
                    orange: '#F38020',
                    gray: '#1E1E1E',   // Dark gray background
                    dark: '#141414',   // Darker background (sidebar)
                    surface: '#2D2D2D', // Card background
                    text: '#D9D9D9',
                    border: '#404040'
                }
            }
        },
    },
    plugins: [],
}
