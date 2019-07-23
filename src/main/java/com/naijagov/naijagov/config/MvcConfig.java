package com.naijagov.naijagov.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
@Configuration
public class MvcConfig implements WebMvcConfigurer{
    
    public void addViewControllers(ViewControllerRegistry registry){
        registry.addViewController("/pollingunits-react").setViewName("pollingunits-react");
        registry.addViewController("/pollingunits-material").setViewName("pollingunits-material");
    }
}
