package com.google.gerrit.plugins.checks.jenkins;

import com.google.common.flogger.FluentLogger;
import com.google.gerrit.server.config.GerritServerConfig;
import com.google.gerrit.server.config.PluginConfigFactory;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import org.eclipse.jgit.lib.Config;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.stream.Collectors;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@Singleton
public class JenkinsProxyServlet extends HttpServlet {
  private static final FluentLogger log = FluentLogger.forEnclosingClass();
  private final HttpClient httpClient = HttpClient.newBuilder().build();

  @Override
  protected void doPost(HttpServletRequest req, HttpServletResponse res) throws IOException {
    String jenkinsAuth = req.getHeader("X-Jenkins-Auth");
    String targetUrl = req.getHeader("X-Jenkins-Server");
    String urlPath = req.getHeader("X-Jenkins-UrlPath");
    String finalUrl = targetUrl + "/" + urlPath;

    if (jenkinsAuth.isEmpty() ||
        targetUrl.isEmpty() ||
        urlPath.isEmpty() ||
        finalUrl.isEmpty()) {
      res.sendError(502, "Invalid parameters to communicate with Jenkins");
    }

    log.atFine().log("URL: %s targetURL: %s AUTH: %s finalUrl: %s", urlPath, targetUrl, jenkinsAuth, finalUrl);
    String auth = Base64.getEncoder().encodeToString(jenkinsAuth.getBytes());

    HttpRequest jenkinsRequest = HttpRequest.newBuilder()
        .uri(URI.create(finalUrl))
        .header("Authorization", "Basic " + auth)
        .GET()
        .build();

    try {
      HttpResponse<String> response = httpClient.send(jenkinsRequest, HttpResponse.BodyHandlers.ofString());

      res.setStatus(response.statusCode());
      res.setContentType("application/json");
      res.getWriter().write(response.body());
    } catch (InterruptedException | IOException e) {
      res.sendError(502, "Failed to communicate with Jenkins: " + e.getMessage());
    }
  }
}
