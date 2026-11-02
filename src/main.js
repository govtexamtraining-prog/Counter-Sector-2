import './styles.css'
import App from './ui/App.svelte'
import { boot } from './client/loop.js'

new App({ target: document.getElementById('app') })
boot()
