/* Настройки второго дилерского сайта. Здесь НЕТ секретов: токен GitHub хранится только в браузере
   владельца, ключ менеджера и ключи уведомлений — в свойствах скрипта Google Apps Script. */
self.SITE_CONFIG = {  // self = window на странице и глобальный объект в service worker
  // Репозиторий этого сайта — в него редактор цен сохраняет prices.json
  REPO: 'Unus777/almaly-dealers-prototype',
  BRANCH: 'main',
  SITE_URL: 'https://unus777.github.io/almaly-dealers-prototype/',

  // Главный дилерский сайт: остатки подтягиваются отсюда при каждом открытии страницы
  MASTER_DATA: 'https://almaliceramicc.github.io/almaly-dealers/data.json',

  // Приём заявок: адрес веб-приложения Google Apps Script (…/exec) — см. SETUP.md, шаг 1.
  // Пока пусто, кнопка «Отправить менеджеру» предлагает WhatsApp и звонок.
  REQUESTS_URL: '',

  // Контакты — с визитки компании (как на главном дилерском сайте)
  CONTACTS: {
    company: 'ООО «Алмалы-Керамик»',
    phone: '+7 499 390-78-88',
    phone2: '+7 925 390-78-88',
    whatsapp: '79253907888',
    email: 'almaliceramic@mail.ru',
    address: 'г. Москва, ул. Монтажная, д. 3, этаж 4, офис 41',
  },
};
