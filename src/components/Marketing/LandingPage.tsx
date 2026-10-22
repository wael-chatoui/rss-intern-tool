import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import './marketing.css';

export function LandingPage({ signedIn = false, signupEnabled = false, billingEnabled = false }: { signedIn?: boolean; signupEnabled?: boolean; billingEnabled?: boolean }) {
  const workspaceHref = signedIn ? '/espace' : '/connexion';

  return (
    <div className="marketing-page">
      <a className="skip-link" href="#contenu">Aller au contenu</a>

      <header className="marketing-header marketing-container">
        <Link href="/" className="marketing-brand" aria-label="La Rédaction, accueil">
          <span className="marketing-brand-mark" aria-hidden="true">r.</span>
          <span>La Rédaction</span>
        </Link>
        <nav className="marketing-nav" aria-label="Navigation principale">
          <a href="#fonctionnalites" className="marketing-nav-features">Fonctionnalités</a>
          <Link href={workspaceHref} className="marketing-nav-account">
            {signedIn ? 'Mon espace' : 'Se connecter'}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="contenu">
        <section className="marketing-hero marketing-container" aria-labelledby="landing-title">
          <div className="marketing-hero-copy">
            <h1 id="landing-title">De la veille<br />à la rédaction.</h1>
            <p>Rassemblez vos sources RSS, conservez les articles utiles et préparez vos textes dans un même espace.</p>
            <Link href={signedIn ? workspaceHref : signupEnabled ? '/inscription' : '/demo'} className="marketing-primary-link">
              {signedIn ? 'Ouvrir mon espace' : signupEnabled ? 'Créer mon espace privé' : 'Essayer la démonstration'}
              <ArrowRight aria-hidden="true" />
            </Link>
            {signupEnabled && <Link href="/demo" className="marketing-demo-link">Essayer sans compte<ArrowUpRight aria-hidden="true" /></Link>}
          </div>

          <figure className="marketing-product">
            <div className="marketing-product-window">
              <div className="marketing-product-bar" aria-hidden="true">
                <span className="marketing-product-dots"><i /><i /><i /></span>
                <span>La Rédaction</span>
                <span className="marketing-product-bar-spacer" />
              </div>
              <div className="marketing-product-crop">
                {/* A real capture of the reading workspace, generated from this application. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/newsroom-preview.jpg"
                  width="1440"
                  height="1000"
                  alt="L’espace de veille de La Rédaction, avec les sources RSS, les articles et le carnet de notes."
                  fetchPriority="high"
                />
              </div>
            </div>
            <figcaption>Aperçu de l’application avec des données de démonstration.</figcaption>
          </figure>
        </section>

        <section id="fonctionnalites" className="marketing-workflow marketing-container" aria-labelledby="workflow-title">
          <div className="marketing-section-intro">
            <h2 id="workflow-title">Lire, noter,<br />préparer.</h2>
            <p>De l’article repéré au sujet à rédiger, gardez vos sources à portée de main.</p>
          </div>

          <div className="marketing-workflow-list">
            <article className="marketing-workflow-step">
              <span className="marketing-step-number" aria-hidden="true">01</span>
              <div>
                <h3>Suivre les sources qui vous intéressent</h3>
                <p>Ajoutez vos flux RSS, parcourez les derniers articles et filtrez la veille par source, langue ou thématique.</p>
                <span className="marketing-feature-detail">Vues magazine et liste · Suivi lu / non lu</span>
              </div>
            </article>
            <article className="marketing-workflow-step">
              <span className="marketing-step-number" aria-hidden="true">02</span>
              <div>
                <h3>Garder une idée avec sa source</h3>
                <p>Enregistrez les articles utiles. Créez une note depuis un article pour conserver son lien, puis rédigez dans votre carnet.</p>
                <span className="marketing-feature-detail">Notes sourcées · Enregistrement automatique</span>
              </div>
            </article>
            <article className="marketing-workflow-step">
              <span className="marketing-step-number" aria-hidden="true">03</span>
              <div>
                <h3>Organiser les sujets à venir</h3>
                <p>Faites avancer vos sujets dans le tableau de préparation et retrouvez les dates prévues dans le calendrier éditorial.</p>
                <span className="marketing-feature-detail">Tableau par statut · Calendrier</span>
              </div>
            </article>
          </div>
        </section>

        <section className="marketing-transfer" aria-labelledby="transfer-title">
          <div className="marketing-transfer-inner marketing-container">
            <div className="marketing-transfer-copy">
              <h2 id="transfer-title">Emporter<br />votre travail.</h2>
              <p>Importez vos sources et vos notes, ou exportez votre sélection dans un format réutilisable. Chaque import présente les changements avant confirmation.</p>
            </div>
            <div className="marketing-formats">
              <p className="marketing-formats-title">Formats d’export disponibles</p>
              <dl>
                <div><dt>Sources RSS</dt><dd>OPML, JSON</dd></div>
                <div><dt>Notes</dt><dd>Markdown, TXT, HTML, JSON, PDF</dd></div>
                <div><dt>Articles</dt><dd>CSV, Markdown, HTML, JSON, PDF</dd></div>
                <div><dt>Espace complet</dt><dd>Sauvegarde JSON</dd></div>
              </dl>
            </div>
          </div>
        </section>

        {billingEnabled && <section className="marketing-offer marketing-container" aria-labelledby="offer-title">
          <div><h2 id="offer-title">Un espace privé<br />pour votre rédaction.</h2><p>Sources RSS, notes multisources, planning et exports, dans un seul abonnement.</p></div>
          <div className="marketing-offer-details"><p className="marketing-offer-price">5,90 €<span>par mois</span></p><p>Abonnement mensuel. Annulation depuis votre compte. Après résiliation, vos données restent consultables et exportables.</p><Link className="marketing-primary-link" href={signedIn ? '/compte' : '/inscription'}>{signedIn ? 'Mon abonnement' : 'Créer mon espace'}<ArrowRight aria-hidden="true" /></Link><p className="marketing-offer-terms">Les éventuelles taxes et le total sont précisés avant paiement.</p></div>
        </section>}

        <section className="marketing-faq marketing-container" aria-labelledby="faq-title">
          <h2 id="faq-title">Quelques précisions.</h2>
          <div className="marketing-faq-list">
            <details>
              <summary>Mes notes sont-elles privées ?<span aria-hidden="true" className="marketing-faq-plus" /></summary>
              <p>Chaque compte possède son propre espace de sources, d’articles et de notes. Vos contenus ne sont pas visibles depuis le compte d’un autre abonné.</p>
            </details>
            <details>
              <summary>Puis-je ajouter mes propres sources ?<span aria-hidden="true" className="marketing-faq-plus" /></summary>
              <p>Oui. Ajoutez l’adresse d’un flux RSS dans « Mes sources ». Vous pouvez ensuite le mettre en pause ou le retirer. Un fichier OPML permet aussi d’importer plusieurs sources.</p>
            </details>
            <details>
              <summary>Le planning publie-t-il sur les réseaux ?<span aria-hidden="true" className="marketing-faq-plus" /></summary>
              <p>Le planning sert à organiser les sujets et les dates de préparation. La publication sur les réseaux se fait ensuite depuis vos outils habituels.</p>
            </details>
            <details>
              <summary>Puis-je importer un carnet existant ?<span aria-hidden="true" className="marketing-faq-plus" /></summary>
              <p>Les notes peuvent être importées en Markdown, texte, HTML, JSON, ZIP ou PDF contenant du texte. Un aperçu permet de vérifier les ajouts et les doublons avant l’import.</p>
            </details>
          </div>
        </section>

        <section className="marketing-start marketing-container" aria-labelledby="start-title">
          <h2 id="start-title">Votre prochain sujet<br />commence ici.</h2>
          <div className="marketing-start-actions">
            <Link href={signedIn ? workspaceHref : signupEnabled ? '/inscription' : '/demo'} className="marketing-start-link">
              {signedIn ? 'Ouvrir mon espace' : signupEnabled ? 'Créer mon espace privé' : 'Essayer sans compte'}
              <ArrowRight aria-hidden="true" />
            </Link>
            {!signedIn && !signupEnabled && <>
              <p>Pour un essai avec vos propres sources, contactez l’éditeur. Les inscriptions publiques sont encore fermées.</p>
              <a className="marketing-demo-link" href="https://wael-chatoui.vercel.app/?utm_source=la_redaction&utm_medium=referral&utm_campaign=tests_oct2026&utm_content=landing_test_access#contact">Demander un accès de test<ArrowUpRight aria-hidden="true" /></a>
            </>}
          </div>
        </section>
      </main>

      <footer className="marketing-footer marketing-container">
        <span className="marketing-footer-brand">La Rédaction</span>
        <p>Veille RSS, notes et planning éditorial.</p>
        <nav aria-label="Informations légales"><Link href="/mentions-legales">Mentions légales</Link><Link href="/conditions">Conditions</Link><Link href="/confidentialite">Confidentialité</Link></nav>
        <a href="#contenu">Retour en haut <span aria-hidden="true">↑</span></a>
      </footer>
    </div>
  );
}
