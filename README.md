# employee-engine
Employee Search Engine For Al-Islam MD

## Web search setup

Web results are displayed inside People Index. The search provider keys stay on the Vercel server and must not be added to `index.html`.

In the Vercel dashboard, open the project, then **Settings → Environment Variables**. Add credentials for at least one provider:

- Google Custom Search: `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ENGINE_ID`
- Brave Search: `BRAVE_SEARCH_API_KEY`

Save the variables and redeploy the project. In People Index, select the provider whose credentials you configured under **Preferences**.

To use People Index from a browser address bar, add a site-search shortcut with this URL, replacing the domain with your production URL:

```text
https://your-domain.example/?web=%s
```

Vercel's `/api/search` function calls the selected provider. The Google and Brave APIs may require an account, enabled API access, or an API plan. Keep keys private and review the provider's quota limits.
