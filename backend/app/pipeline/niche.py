"""Weighted keyword niche classifier (pt-BR first, some en/es terms).

Signals, strongest first: the page's Facebook categories, the offer destination (domain, app id),
the page name and the ad text. `keywords` count 1 hit each, `weak` ones 0.4: generic words such as
"investir" or "casa" appear in ads of every niche and only break ties. A trailing `*` matches any
word ending ("revend*" -> revender, revendedora). "renda extra" is deliberately absent: it is the
pitch of resellers, delivery apps, recipes and trading alike, not a niche.
"""

import re
from dataclasses import dataclass

from app.pipeline.normalize import strip_accents

NICHES: dict[str, dict] = {
    "revenda": {
        "label": "Revenda e consultoria",
        "keywords": ["revend*", "revenda*", "consultora*", "consultoria de beleza", "venda direta", "atacado",
                     "maleta", "consignad*", "comissao", "programa de indicacao", "indicando", "catalogo",
                     "pecas no atacado", "fornecedor", "lucro de ate", "sem estoque"],
        "weak": ["negocio proprio", "empreender", "lucre", "sem investir"],
    },
    "entregas_apps": {
        "label": "Entregas e motorista de app",
        "keywords": ["entregador*", "entregas", "blocos de entrega", "motorista*", "motoboy", "moto ou bike",
                     "corridas", "frete*", "utilitario de carga", "driver", "mercadoenvios", "fazer entregas"],
        "weak": ["entrega", "veiculo", "rodar", "ganhos semanais", "seus horarios"],
    },
    "empregos": {
        "label": "Vagas e empregos",
        "keywords": ["contratando", "vaga", "vagas", "curriculo", "processo seletivo", "jovem aprendiz",
                     "carteira assinada", "clt", "operador de caixa", "recrut*", "gupy", "jobs"],
        "weak": ["com ou sem experiencia"],
    },
    "emagrecimento": {
        "label": "Emagrecimento",
        "keywords": ["emagrecer", "emagrecimento", "emagreca", "emagreci", "emagrecendo", "perder peso",
                     "perdi peso", "secar", "desinchar", "desincha", "inchaco", "gordura localizada",
                     "queimar gordura", "kg a menos", "quilos", "dieta", "termogenico", "detox", "low carb",
                     "jejum intermitente", "ozempic", "mounjaro", "weight loss"],
        "weak": ["barriga", "gordura", "metabolismo"],
    },
    "beleza_estetica": {
        "label": "Beleza e estética",
        "keywords": ["skincare", "rugas", "maquiagem", "queda de cabelo", "cilios", "sobrancelha", "estetica",
                     "harmonizacao", "colageno", "serum", "perfume*", "fragrancia*", "cosmetico*", "unhas",
                     "botox", "anti idade", "antienvelhecimento", "capilar"],
        "weak": ["pele", "cabelo", "manchas", "beleza"],
    },
    "saude": {
        "label": "Saúde",
        "keywords": ["dor nas costas", "articulacoes", "diabetes", "pressao alta", "ansiedade", "insonia",
                     "imunidade", "suplemento", "vitamina", "prostata", "zumbido", "intestino", "menopausa",
                     "colesterol", "fisioterapia", "dor no joelho"],
        "weak": ["visao", "saude"],
    },
    "fitness": {
        "label": "Fitness",
        "keywords": ["treino", "academia", "musculacao", "hipertrofia", "whey", "creatina", "personal trainer",
                     "ganhar massa", "abdomen", "pilates", "crossfit"],
        "weak": ["corrida"],
    },
    "financas": {
        "label": "Finanças e investimentos",
        "keywords": ["renda passiva", "acoes", "bolsa de valores", "dividendos", "cripto*", "bitcoin",
                     "day trade", "daytrade*", "trader*", "trade", "trading", "forex", "xauusd", "mini indice",
                     "mini dolar", "corretora", "broker", "prop firm", "funded", "mesa proprietaria",
                     "mercado financeiro", "expert advisor", "metatrader", "mt5", "renda fixa", "tesouro direto",
                     "emprestimo*", "cartao de credito", "limpar nome", "dividas", "financiamento",
                     "maquininha*", "conta digital", "link de pagamento", "receber pagamentos"],
        "weak": ["investir", "investimento*", "credito", "lucros"],
    },
    "marketing_digital": {
        "label": "Marketing digital e infoprodutos",
        "keywords": ["marketing digital", "trafego pago", "afiliad*", "hotmart", "kiwify", "eduzz",
                     "infoproduto*", "copywriting", "mentoria", "instagram para negocios", "dropshipping",
                     "loja virtual", "ecommerce", "e commerce", "criador de conteudo", "criadores", "ugc",
                     "meta ads", "google ads", "social media", "anuncios"],
        "weak": ["lancamento", "vender mais", "faturamento", "seguidores"],
    },
    "artesanato": {
        "label": "Artesanato",
        "keywords": ["artesanato", "artesanal", "amigurumi", "croche", "bordado", "resina*", "epoxi",
                     "costura", "velas aromaticas", "sabonete artesanal", "biscuit", "macrame"],
        "weak": ["personalizad*"],
    },
    "relacionamento": {
        "label": "Relacionamento",
        "keywords": ["reconquistar", "ex namorado", "ex namorada", "relacionamento", "casamento", "seducao",
                     "conquistar", "namoro", "solteira", "solteiro", "amor proprio"],
        "weak": [],
    },
    "educacao_concursos": {
        "label": "Educação e cursos profissionalizantes",
        "keywords": ["concurso", "enem", "vestibular", "faculdade", "pos graduacao", "graduacao ead", "edital",
                     "oab", "curso tecnico", "mba", "formacao profissional", "profissionalizante",
                     "calculo trabalhista", "pjecalc"],
        "weak": ["aprovacao", "certificado", "profissao", "alunos"],
    },
    "idiomas": {
        "label": "Idiomas",
        "keywords": ["ingles", "espanhol", "fluencia", "idioma", "english", "frances", "alemao"],
        "weak": [],
    },
    "pets": {
        "label": "Pets",
        "keywords": ["cachorro", "gato", "pet", "racao", "cao", "filhote", "veterinario", "adestramento"],
        "weak": [],
    },
    "moda": {
        "label": "Moda e acessórios",
        "keywords": ["vestido", "roupa*", "moda", "calca", "tenis", "sapato", "bolsa feminina", "lingerie",
                     "moda intima", "biquini", "relogio", "oculos", "joias", "semijoias", "prata 925", "pratas",
                     "plus size", "t shirts", "acessorios"],
        "weak": ["look"],
    },
    "casa_decoracao": {
        "label": "Casa e decoração",
        "keywords": ["decoracao", "organizador", "moveis", "colchao", "jardim", "utensilios",
                     "eletrodomestico", "air fryer", "aspirador", "refrigeracao", "ar condicionado"],
        "weak": ["casa", "cozinha", "limpeza"],
    },
    "tecnologia": {
        "label": "Tecnologia",
        "keywords": ["iphone", "celular", "smartphone", "notebook", "fone", "inteligencia artificial",
                     "chatgpt", "software", "saas", "programacao", "smartwatch"],
        "weak": ["aplicativo", "app"],
    },
    "imoveis": {
        "label": "Imóveis",
        "keywords": ["apartamento*", "imovel", "imoveis", "lancamento imobiliario", "casa propria",
                     "minha casa minha vida", "condominio", "lote", "terreno", "aluguel", "empreendimento"],
        "weak": [],
    },
    "automotivo": {
        "label": "Automotivo",
        "keywords": ["carro", "seguro auto", "consorcio", "concessionaria", "pneu", "capacete*", "oficina*",
                     "locadora"],
        "weak": ["moto", "veiculo"],
    },
    "alimentacao": {
        "label": "Alimentação e receitas",
        "keywords": ["receita*", "confeitaria", "confeiteira", "bolo*", "doces", "marmita*", "restaurante",
                     "chocolate", "salgados", "gastronomia", "brigadeiro*", "conserva*", "biscoito*",
                     "sobremesa*", "brownie*", "caseirinho*", "espetinho*", "churrasco", "supermercado*"],
        "weak": ["delivery", "cafe"],
    },
    "apostas": {
        "label": "Apostas e iGaming",
        "keywords": ["aposta", "apostas", "bet", "cassino", "slot", "roleta", "bonus de deposito", "tigrinho",
                     "palpites", "odds"],
        "weak": [],
    },
    "espiritualidade": {
        "label": "Espiritualidade",
        "keywords": ["oracao", "deus", "biblia*", "espiritual", "tarot", "signo", "astrologia", "lei da atracao",
                     "manifestar", "meditacao"],
        "weak": ["fe", "energia"],
    },
    "maternidade": {
        "label": "Maternidade e bebês",
        "keywords": ["bebe", "gravidez", "gestante", "maternidade", "amamentacao", "fralda", "mamae"],
        "weak": ["filhos", "infantil", "criancas"],
    },
}

# Facebook page categories (lowercased substrings) -> niche.
CATEGORY_NICHES: list[tuple[str, str]] = [
    ("beauty", "beleza_estetica"), ("cosmetic", "beleza_estetica"), ("skin care", "beleza_estetica"),
    ("hair", "beleza_estetica"), ("health/beauty", "beleza_estetica"),
    ("clothing", "moda"), ("jewelry", "moda"), ("fashion", "moda"), ("shoe", "moda"),
    ("restaurant", "alimentacao"), ("food", "alimentacao"), ("bakery", "alimentacao"),
    ("grocery", "alimentacao"), ("dessert", "alimentacao"),
    ("bank", "financas"), ("financ", "financas"), ("invest", "financas"), ("insurance", "financas"),
    ("real estate", "imoveis"), ("automotive", "automotivo"), ("car dealership", "automotivo"),
    ("pet", "pets"), ("gym", "fitness"), ("fitness", "fitness"), ("sports", "fitness"),
    ("medical", "saude"), ("health", "saude"), ("doctor", "saude"), ("hospital", "saude"),
    ("education", "educacao_concursos"), ("school", "educacao_concursos"), ("college", "educacao_concursos"),
    ("language", "idiomas"), ("software", "tecnologia"), ("app page", "tecnologia"),
    ("computers", "tecnologia"), ("electronics", "tecnologia"), ("gambling", "apostas"), ("casino", "apostas"),
    ("religious", "espiritualidade"), ("church", "espiritualidade"), ("spiritual", "espiritualidade"),
    ("baby", "maternidade"), ("furniture", "casa_decoracao"), ("home decor", "casa_decoracao"),
    ("home improvement", "casa_decoracao"), ("marketing", "marketing_digital"),
    ("advertising", "marketing_digital"), ("arts & crafts", "artesanato"),
    ("transportation", "entregas_apps"), ("delivery", "entregas_apps"), ("logistics", "entregas_apps"),
    ("employment", "empregos"), ("recruiter", "empregos"),
]

WEAK_WEIGHT = 0.4
TEXT_WEIGHT = 1.0
PAGE_WEIGHT = 1.5
OFFER_WEIGHT = 1.5
CATEGORY_WEIGHT = 2.0
MIN_SCORE = 1.0


def _term(keyword: str) -> str:
    if keyword.endswith("*"):
        return re.escape(keyword[:-1]) + r"\w*"
    return re.escape(keyword)


def _pattern(keywords: list[str]) -> re.Pattern | None:
    if not keywords:
        return None
    return re.compile(r"\b(?:" + "|".join(_term(k) for k in keywords) + r")\b")


_PATTERNS = {niche: (_pattern(d["keywords"]), _pattern(d["weak"])) for niche, d in NICHES.items()}
# Offer keys glue words together ("chaveirosamigurumi", "revendedores.grupoboticario"): match substrings.
_OFFER_TERMS = {
    niche: [(k.rstrip("*").replace(" ", ""), 1.0) for k in d["keywords"] if len(k.rstrip("*")) >= 5]
    + [(k.rstrip("*").replace(" ", ""), WEAK_WEIGHT) for k in d["weak"] if len(k.rstrip("*")) >= 5]
    for niche, d in NICHES.items()
}


# Reseller and recipe pitches promise "no investment"; that says nothing about finance.
_NO_INVESTMENT = re.compile(
    r"\b(?:sem (?:precisar |ter que )?investir(?: nada)?|investir nada|zero investimento|"
    r"baixo investimento|sem investimento|investimento inicial)\b"
)


def _normalize(text: str | None) -> str:
    return _NO_INVESTMENT.sub(" sem investir ", strip_accents(text.lower())) if text else ""


def _text_hits(text: str, weight: float, scores: dict[str, float]) -> None:
    if not text:
        return
    for niche, (strong, weak) in _PATTERNS.items():
        hits = (len(strong.findall(text)) if strong else 0) + WEAK_WEIGHT * (len(weak.findall(text)) if weak else 0)
        if hits:
            scores[niche] = scores.get(niche, 0.0) + weight * hits


def _offer_hits(offer_key: str, scores: dict[str, float]) -> None:
    if not offer_key or offer_key.startswith(("page:", "instagram:", "whatsapp:")):
        return
    compact = re.sub(r"[^a-z0-9]", "", offer_key)
    for niche, terms in _OFFER_TERMS.items():
        hits = sum(w for term, w in terms if term in compact)
        if hits:
            scores[niche] = scores.get(niche, 0.0) + OFFER_WEIGHT * hits


@dataclass
class NicheSignals:
    texts: list[str | None]
    page_name: str | None = None
    offer_keys: list[str | None] | None = None
    categories: list[str] | None = None


def score_niches(signals: NicheSignals) -> dict[str, float]:
    scores: dict[str, float] = {}
    _text_hits(_normalize(" ".join(t for t in signals.texts if t)), TEXT_WEIGHT, scores)
    _text_hits(_normalize(signals.page_name), PAGE_WEIGHT, scores)
    for key in {k for k in signals.offer_keys or [] if k}:
        _offer_hits(_normalize(key), scores)
    matched = {niche for cat in signals.categories or [] for sub, niche in CATEGORY_NICHES if sub in cat.lower()}
    for niche in matched:
        scores[niche] = scores.get(niche, 0.0) + CATEGORY_WEIGHT
    return scores


def classify_signals(signals: NicheSignals) -> str | None:
    scores = score_niches(signals)
    if not scores:
        return None
    # Ties go to the niche declared first in NICHES (more specific ones are listed first).
    best = max(scores, key=lambda n: (scores[n], -list(NICHES).index(n)))
    return best if scores[best] >= MIN_SCORE else None


def niche_options() -> list[dict[str, str]]:
    options = [{"id": key, "label": data["label"]} for key, data in NICHES.items()]
    return sorted(options, key=lambda o: strip_accents(o["label"].lower()))
