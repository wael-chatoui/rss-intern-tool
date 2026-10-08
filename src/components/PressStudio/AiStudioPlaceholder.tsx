'use client';

import React, { useState } from 'react';
import { Sparkles, Copy, Check, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PromptTemplate {
  id: string;
  title: string;
  platform: string;
  description: string;
  prompt: string;
}

const TEMPLATES: PromptTemplate[] = [
  {
    id: 'tiktok-viral-script',
    title: 'Script TikTok / Reel Décryptage (0-3s Hook + Structure)',
    platform: 'TikTok / Instagram Reels',
    description: 'Transforme un fait d\'actualité fashion en vidéo courte rythmée avec accroche forte.',
    prompt: `Tu es un créateur de contenu et journaliste mode expert sur TikTok et Instagram Reels.
À partir de l'article suivant :
Titre : {{ARTICLE_TITLE}}
Extrait : {{ARTICLE_SNIPPET}}

Rédige un script de 30 à 45 secondes comprenant :
1. Un Hook oral et visuel (0-3s) qui crée une rupture de pattern ou pose une question provocatrice.
2. Le contexte résumé en 1 phrase punchy.
3. 2 points clés d'analyse (pourquoi c'est important pour la mode ou le prêt-à-porter).
4. Un Call to Action (CTA) engageant pour les commentaires.
5. Des indications de B-roll et de mise en scène.`,
  },
  {
    id: 'instagram-carousel',
    title: 'Carrousel Instagram Éditorial (4 à 6 slides)',
    platform: 'Instagram Carousel',
    description: 'Structure un carrousel pédagogique pour éduquer et susciter des partages et enregistrements.',
    prompt: `Tu es directeur éditorial d'un média de mode influent sur Instagram.
À partir de l'article :
Titre : {{ARTICLE_TITLE}}
Extrait : {{ARTICLE_SNIPPET}}

Génère le découpage d'un carrousel de 4 slides :
- Slide 1 : Titre court, intrigant et visuel.
- Slide 2 : Le fait marquant ou l'annonce.
- Slide 3 : L'impact sur les tendances ou l'industrie.
- Slide 4 : Synthèse et question de débat pour la communauté.
+ Rédige une légende (caption) concise et 5 hashtags pertinents.`,
  },
  {
    id: 'linkedin-luxury-analysis',
    title: 'Décryptage Business & Luxe pour LinkedIn',
    platform: 'LinkedIn',
    description: 'Angle économique, managérial ou stratégique orienté professionnels de l\'industrie.',
    prompt: `Tu es analyste senior du secteur du luxe et de la mode pour LinkedIn.
À partir de l'actualité suivante :
Titre : {{ARTICLE_TITLE}}
Extrait : {{ARTICLE_SNIPPET}}

Rédige un post LinkedIn percutant :
1. Une première phrase sans fard qui capte l'attention des cadres dirigeants.
2. Une analyse en 3 points concis sur les implications retail, image ou financières.
3. Une conclusion avec une question ouverte sur l'avenir du secteur.
Ton : Professionnel, incisif, sobre, sans clichés "corporate".`,
  },
];

export const AiStudioPlaceholder: React.FC = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPrompt = (template: PromptTemplate) => {
    navigator.clipboard.writeText(template.prompt);
    setCopiedId(template.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto p-4 sm:p-5 space-y-4 text-foreground">
      {/* Top Banner */}
      <div className="p-4 sm:p-5 rounded-lg bg-card border border-border">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0 text-muted-foreground">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-normal">
                Phase 2
              </Badge>
              <h2 className="text-sm font-semibold text-foreground">
                Assistant IA (Prêt pour intégration)
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
              Les structures de données sont prêtes à accueillir un modèle de langage (OpenAI, Gemini, Anthropic ou Ollama local).
              En attendant l'activation de la génération directe, voici les prompts calibrés.
            </p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="p-3.5 rounded-lg bg-card/60 border border-border space-y-2.5">
        <h3 className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Code className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Socle technique prêt :</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-muted-foreground">
          <div className="p-2.5 rounded-md bg-background border border-border">
            <span className="text-emerald-500 font-medium">✓ Parsing enrichi</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Extraits et images prêts à être injectés.</p>
          </div>
          <div className="p-2.5 rounded-md bg-background border border-border">
            <span className="text-emerald-500 font-medium">✓ Modèle multicanal</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Champs TikTok, IG et LinkedIn dédiés.</p>
          </div>
          <div className="p-2.5 rounded-md bg-background border border-border">
            <span className="text-emerald-500 font-medium">✓ Route API préparée</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Prête pour l'appel au modèle.</p>
          </div>
        </div>
      </div>

      {/* Prompts Catalog */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-foreground">
          Templates de Prompts prêts à l'emploi
        </h3>

        <div className="space-y-2.5">
          {TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              className="p-3.5 rounded-lg bg-card border border-border space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{tmpl.title}</span>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1 font-normal">
                      {tmpl.platform}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tmpl.description}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyPrompt(tmpl)}
                  className="h-7 px-2.5 text-xs font-normal gap-1 shrink-0"
                >
                  {copiedId === tmpl.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copié</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Copier prompt</span>
                    </>
                  )}
                </Button>
              </div>

              <pre className="p-2.5 rounded-md bg-background border border-border text-[11px] text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                {tmpl.prompt}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
