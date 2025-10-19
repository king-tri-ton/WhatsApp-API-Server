require('dotenv').config();

module.exports = {
  AUTH_TOKEN: process.env.AUTH_TOKEN, // Токен авторизации из переменных окружения
  CRM_URL: process.env.CRM_URL, // Ссылка на CRM из переменных окружения
};
