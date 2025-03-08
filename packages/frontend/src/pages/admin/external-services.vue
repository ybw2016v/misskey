<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><XHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="700" :marginMin="16" :marginMax="32">
		<FormSuspense :p="init">
			<dev class="_gaps">
				<MkFolder>
					<template #label>DeepL Translation</template>

					<div class="_gaps_m">
						<MkInput v-model="deeplAuthKey">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>DeepL Auth Key</template>
						</MkInput>
						<MkSwitch v-model="deeplIsPro">
							<template #label>Pro account</template>
						</MkSwitch>
						<MkButton primary @click="save_deepl">Save</MkButton>
					</div>
				</MkFolder>
				<MkFolder>
					<template #label>Llm Translation</template>

					<div class="_gaps_m">
						<MkSwitch v-model="llmTranslatorEnabled">
							<template #label>Enable</template>
						</MkSwitch>
						<MkInput v-model="llmTranslatorBaseUrl" :placeholder="'https://example.com'">
							<template #label>Base URL</template>
							<template #caption>The base URL for Openai compatible API.</template>
						</MkInput>
						<MkInput v-model="llmTranslatorApiKey">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>API Key</template>
						</MkInput>
						<MkInput v-model="llmTranslatorModel">
							<template #label>Model Name</template>
						</MkInput>
						<MkInput v-model="llmTranslatorTemperature" type="number">
							<template #label>Temperature</template>
						</MkInput>
						<MkInput v-model="llmTranslatorTopP" type="number">
							<template #label>Top P</template>
						</MkInput>
						<MkInput v-model="llmTranslatorMaxTokens" type="number">
							<template #label>Max Tokens</template>
						</MkInput>
						<MkTextarea v-model="llmTranslatorSysPrompt">
							<template #label>System Prompt</template>
						</MkTextarea>
						<MkTextarea v-model="llmTranslatorUserPrompt">
							<template #label>User Prompt</template>
						</MkTextarea>
						<MkSwitch v-model="llmTranslatorRedisCacheEnabled">
							<template #label>Redis Cache Enable</template>
						</MkSwitch>
						<MkInput v-model="llmTranslatorRedisCacheTTL" type="number">
							<template #label>Redis Cache TTL</template>
						</MkInput>
						<MkButton primary @click="save_llm">Save</MkButton>
					</div>
				</MkFolder>
			</dev>
		</FormSuspense>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import XHeader from './_header_.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkFolder from '@/components/MkFolder.vue';

const deeplAuthKey = ref<string>('');
const deeplIsPro = ref<boolean>(false);

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
const llmTranslatorRedisCacheTTL = ref<number>(0);


async function init() {
	const meta = await misskeyApi('admin/meta');
	deeplAuthKey.value = meta.deeplAuthKey;
	deeplIsPro.value = meta.deeplIsPro;
	llmTranslatorEnabled.value = meta.enableLlmTranslator;
	llmTranslatorBaseUrl.value = meta.llmTranslatorBaseUrl;
	llmTranslatorApiKey.value = meta.llmTranslatorApiKey;
	llmTranslatorModel.value = meta.llmTranslatorModel;
	llmTranslatorTemperature.value = meta.llmTranslatorTemperature;
	llmTranslatorTopP.value = meta.llmTranslatorTopP;
	llmTranslatorMaxTokens.value = meta.llmTranslatorMaxTokens;
	llmTranslatorSysPrompt.value = meta.llmTranslatorSysPrompt;
	llmTranslatorUserPrompt.value = meta.llmTranslatorUserPrompt;
	llmTranslatorRedisCacheEnabled.value = meta.enableLlmTranslatorRedisCache;
	llmTranslatorRedisCacheTTL.value = meta.llmTranslatorRedisCacheTTL;
}

function save_deepl() {
	os.apiWithDialog('admin/update-meta', {
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
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
		llmTranslatorRedisCacheTtl: llmTranslatorRedisCacheTTL.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: i18n.ts.externalServices,
	icon: 'ti ti-link',
}));
</script>
