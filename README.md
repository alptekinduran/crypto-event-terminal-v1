# Crypto Event Terminal v1

Türkçe, tek kullanıcılı, PWA çalışan kripto event terminali.

## Bu sürümde ne var?
- Şifreli giriş ekranı
- Türkçe olay akışı
- Puan, etki yönü ve güven skoru
- Binance resmi duyurularını ve delisting sayfasını tarama
- SEC basın açıklamaları tarama
- İsteğe bağlı özel RSS kaynakları
- CoinGecko ile takip listesi fiyat özeti
- Web Push altyapısı
- DeepSeek API verilirse AI özetleme

## Hızlı kurulum
```bash
npm install
cp .env.example .env
npm run generate-vapid
npm run dev
```

Ardından üretilecek VAPID anahtarlarını `.env` içine ekle.

## Replit secrets
Aşağıdaki değerleri ekle:
- APP_PASSWORD
- SESSION_SECRET
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT
- DEEPSEEK_API_KEY (opsiyonel)
- COINGECKO_API_KEY (opsiyonel)
- WATCHLIST_JSON
- CUSTOM_PROJECT_SOURCES

## iPhone kullanım notu
Bildirim için siteyi Safari'de açtıktan sonra **Ana Ekrana Ekle** yap ve uygulamayı ana ekrandan aç.

## CUSTOM_PROJECT_SOURCES örneği
```json
[
  {
    "name": "Ethereum Blog",
    "url": "https://blog.ethereum.org/feed.xml",
    "sourceType": "project",
    "limit": 10
  }
]
```

## Uyarı
Bu proje kişisel karar destek aracıdır. Otomatik trade motoru değildir. İlk sinyaller kural tabanlıdır; AI sadece özetleme ve ek açıklama için kullanılır.
