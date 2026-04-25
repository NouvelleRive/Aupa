// Test : login Foodflow via fetch (pas Playwright) + recherche produits
import 'dotenv/config';

const GQL_URL = 'https://odoo.foodflow.com/graphql/vsf';

const LOGIN_MUTATION = `
  mutation login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      partner {
        activeRole { id }
        roles { id }
      }
    }
  }
`;

const GET_PRODUCTS_QUERY = `
  query GetProducts($filter: ProductFilterInput, $currentPage: Int, $pageSize: Int, $search: String, $sort: ProductSortInput) {
    products(filter: $filter, currentPage: $currentPage, pageSize: $pageSize, search: $search, sort: $sort) {
      totalCount
      products {
        id
        name
        price
        clientPrice
        weight
        liter
        unit
        slug
        productId
        sku
        packagings { name qty id discountPercent subName }
        categories { name slug parent { name slug } }
        mainCategory { parent { id color } }
      }
    }
  }
`;

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${GQL_URL}?op=login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': 'https://foodflow.com', 'referer': 'https://foodflow.com/' },
    body: JSON.stringify({ query: LOGIN_MUTATION, variables: { email, password }, operationName: 'login' }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = cookies.find(c => c.startsWith('session_id='));
  if (!sessionCookie) throw new Error(`Pas de session_id. Set-Cookie: ${cookies.join(' || ')}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Login GraphQL error: ${JSON.stringify(json.errors)}`);
  return sessionCookie.split(';')[0]; // "session_id=xxx"
}

async function searchProducts(cookie: string, search: string, pageSize = 20) {
  const res = await fetch(`${GQL_URL}?op=GetProducts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': cookie,
      'origin': 'https://foodflow.com',
      'referer': 'https://foodflow.com/',
    },
    body: JSON.stringify({
      query: GET_PRODUCTS_QUERY,
      variables: { search, currentPage: 1, pageSize, filter: {} },
      operationName: 'GetProducts',
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data.products;
}

async function main() {
  console.log('Login...');
  const cookie = await login(process.env.FOODFLOW_EMAIL!, process.env.FOODFLOW_PASSWORD!);
  console.log('OK, cookie:', cookie.slice(0, 50) + '...');

  const queries = ['epinard', 'comte', 'feta', 'huile olive', 'concentré tomate', 'paprika', 'champignon paris', 'citron jaune', 'myrtille', 'coquillettes'];
  for (const q of queries) {
    const result = await searchProducts(cookie, q, 5);
    console.log(`\n=== "${q}" : ${result.totalCount} hits ===`);
    for (const p of result.products.slice(0, 3)) {
      const pkg = p.packagings?.[0];
      console.log(`  - ${p.name} | ${p.price?.toFixed?.(2)}€ | ${p.weight}kg/${p.liter}L | ${p.unit} | sku=${p.sku} | pkg=${pkg?.name || '?'} qty=${pkg?.qty || '?'}`);
    }
  }
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
