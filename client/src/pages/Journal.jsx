import { useEffect, useState } from 'react';
import { api, formatDate } from '../api';
import { Link } from '../router';
import { ErrorNotice, LoadingRow, PageHeader } from '../components';

function DeskScene() {
  return (
    <>
      <path d="M84 216h472" />
      <path d="M156 216v38M484 216v38" opacity=".3" />
      <rect x="228" y="94" width="196" height="116" rx="8" fill="rgba(255,255,255,.45)" />
      <path d="M326 210v-16M304 210h44" />
      <path d="M250 128h152M250 148h116M250 168h136" opacity=".3" />
      <rect x="206" y="198" width="120" height="18" rx="5" />
      <path d="M226 204h80M236 210h60" opacity=".3" />
      <path d="M472 180h34v18c0 9-7 16-16 16h-2c-9 0-16-7-16-16z" />
      <path d="M506 185h7a9 9 0 0 1 0 18h-7" />
      <path d="M482 168c-5-7 4-11 0-18M496 168c-5-7 4-11 0-18" opacity=".35" />
      <path d="M122 196h36l-5 20h-26z" />
      <path d="M140 196c-20-10-20-36 0-48 20 12 20 38 0 48z" />
      <path d="M140 196v-30" opacity=".3" />
    </>
  );
}

function PapersScene() {
  return (
    <>
      <path d="M96 216h448" />
      <path d="M140 216v30M508 216v30" opacity=".3" />
      <g transform="rotate(-5 253 180)">
        <rect x="178" y="76" width="150" height="140" rx="6" fill="rgba(255,255,255,.45)" />
        <path d="M200 108h106M200 132h84M200 156h98M200 180h70" opacity=".3" />
      </g>
      <g transform="rotate(4 385 180)">
        <rect x="300" y="96" width="170" height="120" rx="6" fill="rgba(255,255,255,.55)" />
        <path d="M322 126h126M322 150h94M322 174h112" opacity=".3" />
      </g>
      <path d="M128 186h72l-7 30h-58z" />
      <path d="M144 186v-8h40v8" />
      <path d="M500 186v-42M514 186v-52M528 186v-34" opacity=".45" />
    </>
  );
}

function MonitorScene() {
  return (
    <>
      <path d="M92 216h456" />
      <path d="M430 216h58M459 216V86M459 86H330" />
      <path d="M459 152h-22" />
      <rect x="208" y="48" width="230" height="142" rx="9" fill="rgba(255,255,255,.45)" />
      <path d="M230 78h188M230 100h142M230 122h164" opacity=".3" />
      <path d="M250 190c0 18 14 26 30 26" opacity=".3" />
      <path d="M150 198h36l-5 18h-26z" />
      <path d="M168 198c-20-10-20-38 0-52 20 14 20 42 0 52z" />
      <path d="M168 198v-32" opacity=".3" />
      <path d="M540 216v-32h34v32M548 184v-18M562 184v-24" opacity=".45" />
    </>
  );
}

function ArticleArt({ article, large = false }) {
  const scene =
    article.tone === 'teal' ? <PapersScene /> : article.tone === 'violet' ? <MonitorScene /> : <DeskScene />;
  return (
    <div className={`article-art${large ? ' article-art-large' : ''} tone-${article.tone || 'blue'}`}>
      <svg viewBox="0 0 640 280" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {scene}
        </g>
      </svg>
    </div>
  );
}

function ArticleList({ articles }) {
  return (
    <div className="article-grid">
      {articles.map((article) => (
        <Link key={article.slug} to={`/jurnal/${article.slug}`} className="article-card">
          <ArticleArt article={article} />
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
        <ArticleArt article={state.article} large />
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
