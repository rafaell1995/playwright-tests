import { resolve } from 'path';
import { test, expect, devices, Page } from '@playwright/test';
import { addToExcel, toSlug } from 'jogajunto-tools-webaudit';

let domainAnchor: string = 'https://www.ciadeestagios.com.br/';

async function getUniqueLinks(page: Page): Promise<string[]> {
	return page.$$eval(
		'a',
		(anchors, thisDomainAnchor) => {
			return Array.from(new Set(anchors.map((anchor) => anchor.href))).filter(
				(href) =>
					href.startsWith(thisDomainAnchor) &&
					// !href.includes('/article/') &&
					// !href.includes('/artigo/') &&
					// !href.includes('/casos-de-sucesso') &&
					// !href.includes('/insights/') &&
					// !href.includes('/noticias/') &&
					// !href.includes('/noticias-') &&
					// !href.includes('/noticiais') &&
					!href.includes('.xml')
			); // Ajuste para filtrar apenas links internos
		},
		domainAnchor
	);
}

async function hasForm(page: Page): Promise<boolean> {
	return page.$$eval('form', (forms) => forms.length > 0);
}

async function testForm(page: Page): Promise<void> {
	const currentPageUrl = page.url(); // Salva a URL atual antes de enviar o formulário

	await page.waitForSelector('.bricks-form__fieldset', { state: 'visible' });

	await page.waitForTimeout(3000); // Espera 5 segundos

	// Assumindo que os formulários têm campos 'input' e 'textarea'
	const inputSelectors = await page.$$eval(
		'form .bricks-form__field input, form .bricks-form__field textarea',
		(elements) => elements.map((e) => e.getAttribute('name') || e.getAttribute('id')).filter((e) => e)
	);

	// Adicione um ouvinte para dialog/popups
	page.on('dialog', async (dialog) => {
		console.log(`Dialog message: ${dialog.message()}`);
		await dialog.dismiss();
	});

	for (const selector of inputSelectors) {
		// Verifica se o elemento com o seletor dado está visível
		const isVisible = await page.isVisible(`[name="${selector}"]`);
		if (!isVisible) {
			continue; // Se não estiver visível, pule para o próximo campo
		}

		// Obtém o nome da tag do elemento
		const tagName = await page.evaluate((selector) => {
			const element = document.querySelector(`[name="${selector}"]`);
			return element ? element.tagName.toLowerCase() : null;
		}, selector);

		if (!tagName) {
			continue; // Se não encontrou a tag, pule para o próximo
		}

		let inputType: any;
		if (tagName === 'input') {
			// Se for um input, obtém o tipo
			inputType = await page.getAttribute(`input[name="${selector}"]`, 'type');
		} else if (tagName === 'textarea') {
			// Se for um textarea, define o tipo como 'textarea'
			inputType = 'textarea';
		} else {
			// Trata outros casos conforme necessário
			continue;
		}

		let testValue: string;

		switch (inputType) {
			case 'email':
				testValue = 'teste@email.com';
				break;
			case 'tel':
				testValue = '1516156156';
				break;
			case 'text':
				testValue = 'Texto de Teste';
				break;
			// Adicione mais casos conforme necessário para outros tipos de input
			default:
				testValue = 'Valor Padrão';
		}

		// Preencher o campo com o valor de teste
		await page.fill(`input[name="${selector}"], textarea[name="${selector}"]`, testValue);
	}

	try {
		// Adicione lógica para clicar em botões de envio, se necessário
		await page.click('.bricks-form__submit button');

		// Aqui, você pode adicionar verificações para ver se ocorreram erros após a submissão
		// Exemplo: verificar se uma mensagem de erro é exibida
		const isErrorMessageVisible = await page.locator('label.error').isVisible();
		if (isErrorMessageVisible) {
			// Se encontrar um erro, pause o teste
			await page.pause();
		} else {
			// Se não houver erro, volta para a URL original
			await page.goto(currentPageUrl);
		}
	} catch (error) {
		console.error('Erro encontrado durante o teste do formulário:', error);
		// Pause o teste para depuração
		await page.pause();
	}
}

test.describe('Form tests', () => {
	test.setTimeout(90 * 60 * 1000);

	test.skip('Testar formulários ao navegar pelo site', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto(domainAnchor);

		const visited = new Set<string>();
		const pagesToVisit = [page.url()];

		while (pagesToVisit.length > 0) {
			const currentPage: any = pagesToVisit.pop();
			if (!visited.has(currentPage)) {
				visited.add(currentPage);
				await page.goto(currentPage);

				if (await hasForm(page)) {
					await testForm(page);
				}

				const links = await getUniqueLinks(page);
				links.forEach((link) => {
					if (!visited.has(link)) {
						pagesToVisit.push(link);
					}
				});
			}
		}

		await context.close();
	});
});
