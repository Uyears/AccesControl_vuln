'use strict';

const express = require('express');
const { notFound } = require('../http');

const router = express.Router();

function articleView(req, article) {
  const employee = req.app.locals.db.findEmployeeByGuid(article.authorGuid);
  const view = {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    publishedAt: article.publishedAt,
    tone: article.tone,
    body: article.body,
    author: employee
      ? {
          guid: employee.guid,
          name: employee.name,
          title: employee.title,
          department: employee.department,
        }
      : null,
  };

  // VULN[excessive data exposure + IDOR by GUID]: respons publik ikut
  // mengirim profil internal lengkap (email, telepon, lokasi). GUID yang sama
  // dapat dipakai pada /api/employees/:guid.
  // FIX: kirim hanya field profil yang memang publik.
  if (employee) {
    view.authorProfile = employee;
  }

  return view;
}

router.get('/', (req, res) => {
  const articles = req.app.locals.db.listArticles().map((article) => {
    const view = articleView(req, article);
    delete view.body;
    delete view.authorProfile;
    return view;
  });
  res.json({ articles });
});

router.get('/:slug', (req, res) => {
  const article = req.app.locals.db.findArticleBySlug(req.params.slug);
  if (!article) return notFound(res, 'Artikel tidak ditemukan.');
  return res.json({ article: articleView(req, article) });
});

module.exports = router;
