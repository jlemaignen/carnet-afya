<script lang="ts">
  let { height = 36 }: { height?: number } = $props();
</script>

<!-- Logo AFYA Geneva, repris du prototype ; fond blanc en mode sombre comme dans le carnet. -->
<img src="/logo-afya.png" alt="AFYA Geneva" {height} />

<style>
  img {
    display: block;
    width: auto;
  }
  @media (prefers-color-scheme: dark) {
    img { background: #fff; border-radius: 8px; padding: 3px; }
  }
</style>
