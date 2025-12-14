<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/external-services" :label="i18n.ts.externalServices" :keywords="['external', 'services', 'thirdparty']" icon="ti ti-link">
			<div class="_gaps_m">
				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Google Analytics</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="googleAnalyticsMeasurementId">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Measurement ID</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<MkButton primary @click="save_googleAnalytics">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>DeepL Translation</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="deeplAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="deeplIsPro">
									<template #label><SearchLabel>Pro account</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<MkButton primary @click="save_deepl">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps"> 
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label>Llm Translation</template>

						<div class="_gaps_m">
							<SearchMarker> 
								<MkSwitch v-model="llmTranslatorEnabled">
									<template #label>Enable</template>
									<template #caption>Enable/disable AI-powered(LLM) translation functionality</template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker> 	
								<MkInput v-model="llmTranslatorBaseUrl" :placeholder="'https://example.com'">
									<template #label>Base URL</template>
									<template #caption>The base URL for openai compatible API (e.g., OpenAI or compatible service endpoint)</template>
								</MkInput>
							</SearchMarker>
							
							<SearchMarker> 
								<MkInput v-model="llmTranslatorApiKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label>API Key</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker> 
								<MkInput v-model="llmTranslatorModel">
									<template #label>Model Name</template>
									<template #caption>Llm model to use (e.g., gpt-3.5-turbo, text-davinci-003, deepseek-chat)</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker> 
								<MkInput v-model="llmTranslatorTemperature" type="number">
									<template #label>Temperature</template>
									<template #caption>Sampling temperature (higher = more random/creative)</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker> 
								<MkInput v-model="llmTranslatorTopP" type="number">
									<template #label>Top P</template>
									<template #caption>Nucleus sampling threshold (0-1, alternative to temperature)</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker> 
								<MkInput v-model="llmTranslatorMaxTokens" type="number">
									<template #label>Max Tokens</template>
									<template #caption>Maximum length of response in tokens (affects response length)</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker> 
								<MkTextarea v-model="llmTranslatorSysPrompt">
									<template #label>System Prompt</template>
									<template #caption>Initial system-level instructions for the llm (can use {text} and {targetLang} as placeholders)<br>Example: "You are a translation specialist. Translate content between languages while preserving technical terms."</template>
								</MkTextarea>
							</SearchMarker>

							<SearchMarker> 
								<MkTextarea v-model="llmTranslatorUserPrompt">
									<template #label>User Prompt</template>
									<template #caption>Translation instruction template (may include {text} for source text and {targetLang} for target language)<br>Example: "Translate this to {targetLang}: {text}"</template>
								</MkTextarea>
							</SearchMarker>

							<SearchMarker> 
								<MkSwitch v-model="llmTranslatorRedisCacheEnabled">
									<template #label>Redis Cache Enable</template>
									<template #caption>Cache translations by using redis to reduce API calls and costs</template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker> 
								<MkInput v-model="llmTranslatorRedisCacheTtl" type="number">
									<template #label>Redis Cache TTL</template>
									<template #caption>Cache expiration time in minutes</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker> 
								<MkButton primary @click="save_llm">Save</MkButton>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';

const deeplAuthKey = ref<string>('');
const deeplIsPro = ref<boolean>(false);

const googleAnalyticsMeasurementId = ref<string>('');

const llmTranslatorEnabled = ref<boolean>(false);
const llmTranslatorBaseUrl = ref<string>('');
const llmTranslatorApiKey = ref<string>('');
const llmTranslatorModel = ref<string>('');
const llmTranslatorTemperature = ref<number>(1);
const llmTranslatorTopP = ref<number>(1);
const llmTranslatorMaxTokens = ref<number>(1);
const llmTranslatorSysPrompt = ref<string>('');
const llmTranslatorUserPrompt = ref<string>('');
const llmTranslatorRedisCacheEnabled = ref<boolean>(false);
const llmTranslatorRedisCacheTtl = ref<number>(0);

async function init() {
	const meta = await misskeyApi('admin/meta');
	deeplAuthKey.value = meta.deeplAuthKey ?? '';
	deeplIsPro.value = meta.deeplIsPro;
	googleAnalyticsMeasurementId.value = meta.googleAnalyticsMeasurementId ?? '';
	llmTranslatorEnabled.value = meta.enableLlmTranslator;
	llmTranslatorBaseUrl.value = meta.llmTranslatorBaseUrl ?? '';
	llmTranslatorApiKey.value = meta.llmTranslatorApiKey ?? '';
	llmTranslatorModel.value = meta.llmTranslatorModel ?? '';
	llmTranslatorTemperature.value = meta.llmTranslatorTemperature;
	llmTranslatorTopP.value = meta.llmTranslatorTopP;
	llmTranslatorMaxTokens.value = meta.llmTranslatorMaxTokens;
	llmTranslatorSysPrompt.value = meta.llmTranslatorSysPrompt ?? '';
	llmTranslatorUserPrompt.value = meta.llmTranslatorUserPrompt ?? '';
	llmTranslatorRedisCacheEnabled.value = meta.enableLlmTranslatorRedisCache;
	llmTranslatorRedisCacheTtl.value = meta.llmTranslatorRedisCacheTtl;
}

function save_deepl() {
	os.apiWithDialog('admin/update-meta', {
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_googleAnalytics() {
	os.apiWithDialog('admin/update-meta', {
		googleAnalyticsMeasurementId: googleAnalyticsMeasurementId.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_llm() {
	os.apiWithDialog('admin/update-meta', {
		enableLlmTranslator: llmTranslatorEnabled.value,
		llmTranslatorBaseUrl: llmTranslatorBaseUrl.value,
		llmTranslatorApiKey: llmTranslatorApiKey.value,
		llmTranslatorModel: llmTranslatorModel.value,
		llmTranslatorTemperature: llmTranslatorTemperature.value,
		llmTranslatorTopP: llmTranslatorTopP.value,
		llmTranslatorMaxTokens: llmTranslatorMaxTokens.value,
		llmTranslatorSysPrompt: llmTranslatorSysPrompt.value,
		llmTranslatorUserPrompt: llmTranslatorUserPrompt.value,
		enableLlmTranslatorRedisCache: llmTranslatorRedisCacheEnabled.value,
		llmTranslatorRedisCacheTtl: llmTranslatorRedisCacheTtl.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.externalServices,
	icon: 'ti ti-link',
}));
</script>
