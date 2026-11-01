# -*- coding: utf-8 -*-
"""Assemble index.html : coquille + three.min.js + bvh_data.js + app.js
   en UN seul fichier HTML autonome (aucune ressource externe)."""
import io, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))

def lire(nom, enc='utf-8'):
    with io.open(os.path.join(BASE, nom), 'r', encoding=enc) as f:
        return f.read()

shell = lire('shell.html')
three = lire('three.min.js', 'utf-8')
bvh   = lire('bvh_data.js', 'utf-8')
app   = lire('app.js', 'utf-8')

# nettoyage : three.min.js a été extrait d'un <script> et garde sa balise fermante
for marque in ('</script>', '</SCRIPT>'):
    three = three.replace(marque, '')
    bvh = bvh.replace(marque, '')
    app = app.replace(marque, '')
three = three.strip()
bvh = bvh.strip()
app = app.strip()

def bloc(js):
    return '<script>\n' + js + '\n</script>'

html = shell
for marque, contenu in (
    ('<!--INJECT_THREE-->', bloc(three)),
    ('<!--INJECT_BVH-->',   bloc(bvh)),
    ('<!--INJECT_APP-->',   bloc(app)),
):
    if marque not in html:
        sys.exit('marque introuvable : ' + marque)
    html = html.replace(marque, contenu)

sortie = os.path.join(BASE, 'index.html')
with io.open(sortie, 'w', encoding='utf-8', newline='\n') as f:
    f.write(html)

print('index.html : %.0f Ko' % (len(html.encode('utf-8')) / 1024))
print('  coquille %d o · three %d o · bvh %d o · app %d o' % (len(shell), len(three), len(bvh), len(app)))
