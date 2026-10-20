// 我愛螢圃里 — 前端設定
// 把 Apps Script 部署後的網址（結尾是 /exec）貼在下面
window.ILY_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyMoJr0g2fAzRplwhESxAX4MpVxzH0gdo2rUHoygXas-PdDH-CB71IwGxDI83ZctHV3/exec',
  // 即時資料（YouBike、停車場）在頁面開著時多久重抓一次
  LIVE_REFRESH_MS: 60 * 1000,
  // 里民投稿表單：執行 forms.gs 的 createForms() 後，把執行記錄裡的「填寫網址」貼在這裡（空白就不顯示）
  FORM_STORE_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSeTmTeEkKM8X1iGQrbrH3f3-JV8TwvfMLnXbnQxl3qsA2ul_A/viewform',     // 推薦店家
  FORM_FEEDBACK_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScwHtkbFnIqaXCVCYOy0V9-ymdbQKlNwrp1SrcCjhTLTB3FJw/viewform',  // 網站建議與回報
};
