import { useEffect, useState } from 'react';
import { api, formatDate } from '../api';
import { Link } from '../router';
import { ErrorNotice, LoadingRow, PageHeader } from '../components';

function ArticleList({ articles }) {
  return (
    <div className="article-grid">
      {articles.map((article) => (
        <Link key={article.slug} to={`/jurnal/${article.slug}`} className="article-card">
          <div className={`article-art tone-${article.tone || 'blue'}`} />
          <div className="article-body">
            <span className="eyebrow">{article.category}</span>
            <h3>{article.title}</h3>
            <p className="muted small">{article.excerpt}</p>
            <span className="muted small">{formatDate(article.publishedAt)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Journal({ params }) {
  const [state, setState] = useState({ articles: null, article: null });
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const path = params.slug ? `/api/articles/${encodeURIComponent(params.slug)}` : '/api/articles';
    api(path, { auth: false })
      .then((data) => {
        if (!active) return;
        setState({ articles: data.articles || null, article: data.article || null });
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, [params.slug]);

  if (error) {
    return (
      <>
        <PageHeader title="Jurnal" />
        <ErrorNotice message={error.message} />
        <Link to="/jurnal" className="btn btn-secondary">
          Kembali ke jurnal
        </Link>
      </>
    );
  }

  if (params.slug) {
    if (!state.article) return <LoadingRow label="Memuat artikel…" />;
    return (
      <article className="article-page">
        <p className="breadcrumb">
          <Link to="/jurnal">Jurnal</Link> / {state.article.category}
        </p>
        <h1>{state.article.title}</h1>
        <p className="muted">
          {state.article.author ? `${state.article.author.name} · ` : ''}
          {formatDate(state.article.publishedAt)}
        </p>
        <div className={`article-art article-art-large tone-${state.article.tone || 'blue'}`} />
        {state.article.body.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </article>
    );
  }

  return (
    <>
      <PageHeader title="Jurnal" subtitle="Catatan singkat tentang ruang kerja, periferal, dan kebiasaan kerja." />
      {!state.articles ? <LoadingRow label="Memuat artikel…" /> : <ArticleList articles={state.articles} />}
    </>
  );
}
