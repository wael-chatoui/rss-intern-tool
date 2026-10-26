/** Public, fictional example. The complete reading order is available without JavaScript. */
export function EditorialScene() {
  return (
    <figure className="editorial-scene" aria-labelledby="editorial-caption">
      <div className="editorial-scene-masthead"><span>Le fil d’un sujet</span><span>Exemple fictif</span></div>
      <ol className="editorial-story">
        <li className="editorial-sheet editorial-source">
          <div className="editorial-sheet-label"><span>01 / La source</span><span aria-hidden="true">↗</span></div>
          <p className="editorial-source-kind">Veille RSS · article de démonstration</p>
          <h2>Réparer plutôt <br />que remplacer.</h2>
          <p>Des ateliers donnent une seconde vie aux objets du quotidien.</p>
          <div className="editorial-source-stamp">Une lecture à creuser</div>
        </li>
        <li className="editorial-sheet editorial-note">
          <div className="editorial-sheet-label"><span>02 / La note sourcée</span><span aria-hidden="true">↳</span></div>
          <h2>Ce que je veux <br />comprendre.</h2>
          <p className="editorial-handnote">Qui répare, et qu’est-ce qui freine encore la réparation ?</p>
          <div className="editorial-reference"><span aria-hidden="true">↗</span><span>Réparer plutôt que remplacer.<small>Référence conservée avec la note</small></span></div>
        </li>
        <li className="editorial-sheet editorial-subject">
          <div className="editorial-sheet-label"><span>03 / Le sujet</span><span aria-hidden="true">→</span></div>
          <span className="editorial-status">À préparer</span>
          <h2>Dans les coulisses <br />d’un atelier.</h2>
          <dl><div><dt>Angle</dt><dd>Rencontrer celles et ceux qui réparent.</dd></div><div><dt>Planning</dt><dd>À planifier</dd></div></dl>
          <p className="editorial-subject-foot">La source suit le sujet.</p>
        </li>
      </ol>
      <figcaption id="editorial-caption">D’une lecture à votre propre angle, sans perdre la référence. Le planning organise votre travail, sans publier à votre place.</figcaption>
    </figure>
  );
}
