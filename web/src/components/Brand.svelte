<script lang="ts">
  let { height = 36 }: { height?: number } = $props();
</script>

<!-- Logo officiel ; variante au texte clair pour le mode sombre. -->
<picture>
  <source srcset="/logo-ccag-dark.png" media="(prefers-color-scheme: dark)" />
  <img src="/logo-ccag.png" alt="Centre de Chirurgie Ambulatoire de Genève" {height} width={Math.round(height * 4.6)} />
</picture>

<style>
  img {
    display: block;
    width: auto;
  }
</style>
