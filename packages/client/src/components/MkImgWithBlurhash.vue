<template>
<div class="xubzgfgb" :class="{ cover }" :title="title">
	<canvas v-if="!loaded" ref="canvas" :width="size" :height="size" :title="title"/>
	<img v-if="src" :src="src" :title="title" :alt="alt" @load="onLoad"  @error="onError"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import { decode } from 'blurhash';

const props = withDefaults(defineProps<{
	src?: string | null;
	hash?: string;
	alt?: string;
	title?: string | null;
	size?: number;
	cover?: boolean;
}>(), {
	src: null,
	alt: '',
	title: null,
	size: 64,
	cover: true,
});

const canvas = $ref<HTMLCanvasElement>();
let loaded = $ref(false);

function draw() {
	if (props.hash == null) return;
	const pixels = decode(props.hash, props.size, props.size);
	const ctx = canvas.getContext('2d');
	const imageData = ctx!.createImageData(props.size, props.size);
	imageData.data.set(pixels);
	ctx!.putImageData(imageData, 0, 0);
}

function onLoad() {
	loaded = true;
}

onMounted(() => {
	draw();
});

function onError(ev: Event) {
	let img = ev.target as HTMLImageElement;
	img.src = "/static-assets/404.png";
	img.onerror = null;
}
</script>

<style lang="scss" scoped>
.xubzgfgb {
	position: relative;
	width: 100%;
	height: 100%;

	> canvas,
	> img {
		display: block;
		width: 100%;
		height: 100%;
	}

	> canvas {
		position: absolute;
		object-fit: cover;
	}

	> img {
		object-fit: contain;
	}

	&.cover {
		> img {
			object-fit: cover;
		}
	}
}
</style>
