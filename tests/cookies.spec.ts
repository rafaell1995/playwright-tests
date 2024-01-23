import { resolve } from 'path';
import { test, expect, devices, Page } from '@playwright/test';
import { addToExcel, toSlug } from 'jogajunto-tools-webaudit';
import { parse } from 'node-html-parser';

const cookiesResults: any = [];
let browser: string = 'browser-undefined';
let device: string = 'device-undefined';

let domainAnchor: string = 'https://weservice.pro/';

async function getSitemapUrls(page: Page, sitemapUrl: string): Promise<string[]> {
	await page.goto(sitemapUrl);
	const sitemapContent = await page.content();
	console.log(sitemapContent);
	const root = parse(sitemapContent);
	const sitemapUrls = root.querySelectorAll('sitemap loc').map((element) => element.textContent);
	return sitemapUrls.filter((url) => url);
}

async function getAllSitemapLinks(page: Page, sitemapUrls: string[]): Promise<string[]> {
	let allLinks = new Set<string>();

	for (const sitemapUrl of sitemapUrls) {
		await page.goto(sitemapUrl);
		console.log(sitemapUrl);
		const sitemapContent = await page.content();
		const root = parse(sitemapContent);
		const urls = root.querySelectorAll('url loc').map((element) => element.textContent);
		urls.forEach((url) => allLinks.add(url));
	}

	return Array.from(allLinks);
}

async function getUniqueLinks(page: Page): Promise<string[]> {
	const links = await page.locator('a').elementHandles();
	const uniqueLinks = new Set<string>();
	const baseUrl = new URL(domainAnchor).origin; // Obter a parte base da URL para comparação

	for (const link of links) {
		const href = await link.getAttribute('href');
		if (href) {
			const fullUrl = href.startsWith('/') ? `${baseUrl}${href}` : href;
			if (
				fullUrl.startsWith(domainAnchor) &&
				// !fullUrl.includes('#') &&
				!fullUrl.includes('/feed') &&
				!fullUrl.includes('.xml') &&
				!fullUrl.includes('.pdf')
			) {
				uniqueLinks.add(fullUrl);
			}
		}
	}

	return Array.from(uniqueLinks);
}

async function listCookies(page: Page): Promise<{ url: string; cookies: any[] }> {
	const cookies = await page.context().cookies();
	return { url: page.url(), cookies };
}

test.describe('Cookies tests', () => {
	test.setTimeout(90 * 60 * 1000);

	test.beforeEach(async ({ browserName, userAgent }) => {
		browser = browserName;
		if (userAgent) {
			const deviceName = Object.keys(devices).find((key) => {
				const device = devices[key];
				return device.userAgent === userAgent;
			});

			if (deviceName) {
				device = toSlug(deviceName);
			}
		}
	});

	test.afterAll(async () => {
		const filePath = resolve(__dirname, `relatorio-cookies-${browser}-${device}.xlsx`);
		const uniqueCookies = new Set<string>();

		for (const { url, cookies } of cookiesResults) {
			for (const cookie of cookies) {
				const cookieSignature = `${cookie.name}`;
				if (!uniqueCookies.has(cookieSignature)) {
					uniqueCookies.add(cookieSignature);

					await addToExcel([url, cookie.name, cookie.value, cookie.domain, cookie.expires], {
						filePath: filePath,
						sheetName: 'Cookies',
						columns: ['URL', 'Name', 'Value', 'Domain', 'Expires'],
					});
				}
			}
		}
	});
	test('Listar cookies ao navegar pelo site', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errorResults: string[] = []; // Array para armazenar as URLs que causam erro

		// Vá para a página inicial
		await page.goto(domainAnchor);

		// Armazena URLs visitadas para evitar repetição
		const visited = new Set<string>();
		const pagesToVisit = [page.url()];

		// data-a11y-dialog-hide

		// Interaja com o banner de cookies aqui, se necessário
		// await page.click('#onetrust-accept-btn-handler');
		// await page.click('button[data-a11y-dialog-hide]');
		// await page.click('.cc-compliance a');

		// Rejeita todos os cookies
		// await page.click('#onetrust-reject-all-handler');

		try {
			while (pagesToVisit.length > 0) {
				const currentPage: any = pagesToVisit.pop();
				if (!visited.has(currentPage)) {
					try {
						await page.goto(currentPage);
						const cookiesData = await listCookies(page);
						cookiesResults.push(cookiesData);
						visited.add(currentPage);
						// Use a nova função refatorada que utiliza Locators
						const links = await getUniqueLinks(page);
						links.forEach((link) => {
							if (!visited.has(link)) {
								pagesToVisit.push(link);
							}
						});
					} catch (error) {
						console.error(`Erro ao acessar ${currentPage}:`, error);
						errorResults.push(currentPage); // Armazena a URL com erro
					}
				}
			}
		} catch (error) {
			console.error('Erro durante a navegação geral:', error);
		} finally {
			await context.close();
		}

		// Adiciona as URLs com erro ao Excel
		if (errorResults.length > 0) {
			const filePath = resolve(__dirname, `erros-cookies-${browser}-${device}.xlsx`);
			for (const url of errorResults) {
				await addToExcel([url, 'Erro ao navegar'], {
					filePath: filePath,
					sheetName: 'Erros',
					columns: ['URL', 'Erro'],
				});
			}
		}
	});

	test.skip('Listar cookies a partir do sitemap', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errorResults: string[] = [];

		// Obter URLs do sitemap de indexação, certifique-se de passar a url do site junto com o sitemap
		const sitemapIndexUrls = await getSitemapUrls(page, `${domainAnchor}`);

		// Obter todos os links dos sitemaps listados
		const sitemapLinks = await getAllSitemapLinks(page, sitemapIndexUrls);

		try {
			// Use o sitemapLinks como a lista de páginas para visitar
			for (const url of sitemapLinks) {
				try {
					await page.goto(url);
					const cookiesData = await listCookies(page);
					cookiesResults.push(cookiesData);
				} catch (error) {
					console.error(`Erro ao acessar ${url}:`, error);
					errorResults.push(url);
				}
			}
		} catch (error) {
			console.error('Erro durante a navegação geral:', error);
		} finally {
			await context.close();
		}

		// Finalize o contexto
		await context.close();

		// Adicione os erros ao Excel como antes
		if (errorResults.length > 0) {
			const filePath = resolve(__dirname, `erros-cookies-${browser}-${device}.xlsx`);
			for (const url of errorResults) {
				await addToExcel([url, 'Erro ao navegar'], {
					filePath: filePath,
					sheetName: 'Erros',
					columns: ['URL', 'Erro'],
				});
			}
		}
	});
});
